import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/unem-server";
import { readVapidEnv } from "@/lib/unem-push";

/**
 * المفتاح العمومي لـ VAPID فقط — لا يحتوي أي سر.
 * تستعمله الواجهة لتفعيل الاشتراك في الإشعارات عبر PushManager.subscribe().
 */
export const Route = createFileRoute("/api/public/push/vapid-key")({
  server: {
    handlers: {
      GET: () => {
        const vapid = readVapidEnv();
        if (!vapid) return json({ publicKey: null }, 200);
        return json({ publicKey: vapid.publicKey });
      },
    },
  },
});
