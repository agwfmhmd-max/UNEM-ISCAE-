export type FcmTokenRow = {
  id: string;
  token: string;
};

type FcmCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type CachedAccessToken = {
  value: string;
  expiresAt: number;
};

let cachedAccessToken: CachedAccessToken | null = null;

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readFcmCredentials(): FcmCredentials | null {
  const rawJson =
    process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] ?? process.env["FCM_SERVICE_ACCOUNT_JSON"];
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      const projectId = String(parsed["project_id"] ?? "").trim();
      const clientEmail = String(parsed["client_email"] ?? "").trim();
      const privateKey = String(parsed["private_key"] ?? "")
        .replace(/\\n/g, "\n")
        .trim();
      if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
    } catch (error) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON", error);
      return null;
    }
  }

  const projectId = process.env["FCM_PROJECT_ID"]?.trim();
  const clientEmail = process.env["FCM_CLIENT_EMAIL"]?.trim();
  const privateKey = process.env["FCM_PRIVATE_KEY"]?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const encoded = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const decoded = base64UrlDecode(encoded);
  const copy = new Uint8Array(decoded.byteLength);
  copy.set(decoded);
  return copy.buffer;
}

async function createJwt(credentials: FcmCredentials): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credentials.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(credentials: FcmCredentials): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.value;
  }

  const assertion = await createJwt(credentials);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    console.error("FCM OAuth token request failed", response.status, await response.text());
    return null;
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) return null;
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000,
  };
  return payload.access_token;
}

export function isFcmConfigured(): boolean {
  return readFcmCredentials() !== null;
}

export async function sendFcmNotification(
  token: string,
  payload: { title: string; body: string; url?: string },
): Promise<"ok" | "gone" | "error"> {
  const credentials = readFcmCredentials();
  if (!credentials) return "error";

  try {
    const accessToken = await getAccessToken(credentials);
    if (!accessToken) return "error";

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            data: {
              title: payload.title,
              body: payload.body,
              url: payload.url ?? "/",
            },
            android: { priority: "HIGH" },
          },
        }),
      },
    );

    if (response.ok) return "ok";
    const errorBody = await response.text();
    if (
      response.status === 404 ||
      response.status === 410 ||
      /UNREGISTERED|registration-token-not-registered/i.test(errorBody)
    ) {
      return "gone";
    }
    console.error("FCM send failed", response.status, errorBody);
    return "error";
  } catch (error) {
    console.error("FCM send exception", error);
    return "error";
  }
}
