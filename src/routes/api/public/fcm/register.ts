import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/unem-config";
import { corsOptions, json } from "@/lib/unem-server";

const ANDROID_APP_ID = "mr.unem.iscae";
const MAX_TOKEN_LENGTH = 4096;

export const Route = createFileRoute("/api/public/fcm/register")({
  server: {
    handlers: {
      OPTIONS: () => corsOptions(),
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "طلب تسجيل FCM غير صالح." }, 400);
        }

        const token = String(body["token"] ?? "").trim();
        const platform = String(body["platform"] ?? "android")
          .trim()
          .toLowerCase();
        const appId = String(body["app_id"] ?? ANDROID_APP_ID).trim();
        const userAgent =
          String(body["user_agent"] ?? "")
            .trim()
            .slice(0, 500) || null;

        if (!token || token.length > MAX_TOKEN_LENGTH) {
          return json({ error: "رمز FCM غير صالح." }, 400);
        }
        if (platform !== "android" || appId !== ANDROID_APP_ID) {
          return json({ error: "بيانات تطبيق FCM غير متوافقة." }, 400);
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_fcm_token`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            p_token: token,
            p_platform: platform,
            p_app_id: appId,
            p_user_agent: userAgent,
          }),
        });

        if (!response.ok) {
          console.error("save_fcm_token RPC failed", response.status, await response.text());
          return json({ error: "تعذر تسجيل جهاز Android للإشعارات." }, 500);
        }

        return json({ success: true });
      },
    },
  },
});
