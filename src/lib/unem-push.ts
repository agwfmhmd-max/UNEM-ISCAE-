import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";

/** بيانات اشتراك الإشعارات كما تصل من قاعدة البيانات (Supabase) */
export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** يقرأ مفاتيح VAPID من متغيرات البيئة (تُولَّد مرة واحدة وتُخزَّن كأسرار على الخادم) */
export function readVapidEnv(): VapidKeys | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:contact@unem-iscae.example";
  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
};

/**
 * يرسل إشعار Push واحد إلى اشتراك واحد باستعمال Web Crypto API فقط
 * (متوافق مع بيئات Edge مثل Cloudflare — لا يعتمد على مكتبة web-push التقليدية).
 * يعيد "ok" أو "gone" (يجب حذف الاشتراك) أو "error".
 */
export async function sendPushNotification(
  sub: StoredPushSubscription,
  payload: PushNotificationPayload,
  vapid: VapidKeys,
): Promise<"ok" | "gone" | "error"> {
  try {
    const subscription: PushSubscription = {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    const message = {
      data: JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || "/",
        icon: payload.icon || "/icon-192.png",
      }),
      options: { ttl: 60 * 60 * 24, urgency: "high" as const },
    };

    const request = await buildPushPayload(message, subscription, vapid);
    const res = await fetch(sub.endpoint, {
      method: request.method,
      headers: request.headers as unknown as HeadersInit,
      body: request.body as unknown as BodyInit,
    });

    if (res.ok) return "ok";
    // 404/410 تعني أن الاشتراك لم يعد صالحاً (المستخدم أزال الإذن أو غيّر المتصفح)
    if (res.status === 404 || res.status === 410) return "gone";
    return "error";
  } catch {
    return "error";
  }
}
