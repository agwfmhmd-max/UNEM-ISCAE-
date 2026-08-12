import { createFileRoute } from "@tanstack/react-router";
import { authenticateCaller, bearerToken, json } from "@/lib/unem-server";
import { readVapidEnv, sendPushNotification, type StoredPushSubscription } from "@/lib/unem-push";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/unem-config";

const MAX_TITLE = 120;
const MAX_BODY = 500;
const CONCURRENCY = 25;

async function fetchAllSubscriptions(token: string): Promise<StoredPushSubscription[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  return (await res.json()) as StoredPushSubscription[];
}

async function deleteSubscriptions(ids: string[], token: string): Promise<void> {
  if (ids.length === 0) return;
  const filter = ids.map((id) => `"${id}"`).join(",");
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${filter})`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
  }).catch(() => null);
}

async function logNotification(
  row: { title: string; body: string; link_url: string | null; sent_by: string; recipients: number; delivered: number; failed: number },
  token: string,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/push_notifications_log`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  }).catch(() => null);
}

/** يرسل الدفعات على مجموعات صغيرة لتفادي إغراق الشبكة بعدد كبير من الطلبات المتوازية دفعة واحدة */
async function sendInBatches(
  subs: StoredPushSubscription[],
  payload: { title: string; body: string; url?: string },
  vapid: NonNullable<ReturnType<typeof readVapidEnv>>,
): Promise<{ delivered: number; failed: number; goneIds: string[] }> {
  let delivered = 0;
  let failed = 0;
  const goneIds: string[] = [];

  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    const batch = subs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sub) => ({ sub, outcome: await sendPushNotification(sub, payload, vapid) })),
    );
    for (const { sub, outcome } of results) {
      if (outcome === "ok") delivered += 1;
      else if (outcome === "gone") goneIds.push(sub.id);
      else failed += 1;
    }
  }

  return { delivered, failed, goneIds };
}

export const Route = createFileRoute("/api/public/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller } = auth;

        if (caller.role !== "admin") {
          return json({ error: "❌ إرسال الإشعارات متاح للمشرف الرئيسي فقط." }, 403);
        }

        const token = bearerToken(request);
        if (!token) return json({ error: "❌ جلسة غير صالحة." }, 401);

        const vapid = readVapidEnv();
        if (!vapid) {
          return json(
            { error: "❌ إعدادات الإشعارات (VAPID) غير مكتملة على الخادم." },
            500,
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "❌ طلب غير صالح." }, 400);
        }

        const title = String(body["title"] ?? "").trim().slice(0, MAX_TITLE);
        const message = String(body["body"] ?? "").trim().slice(0, MAX_BODY);
        const rawUrl = String(body["url"] ?? "").trim();

        if (!title) return json({ error: "❌ عنوان الإشعار مطلوب." }, 400);
        if (!message) return json({ error: "❌ نص الإشعار مطلوب." }, 400);
        if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
          return json({ error: "❌ الرابط غير صالح (يجب أن يبدأ بـ https://)." }, 400);
        }
        const url = rawUrl || undefined;

        const subs = await fetchAllSubscriptions(token);
        if (subs.length === 0) {
          await logNotification(
            { title, body: message, link_url: url ?? null, sent_by: caller.userId, recipients: 0, delivered: 0, failed: 0 },
            token,
          );
          return json({ success: true, total: 0, delivered: 0, failed: 0, message: "لا يوجد مشتركون في الإشعارات حالياً." });
        }

        const { delivered, failed, goneIds } = await sendInBatches(
          subs,
          { title, body: message, ...(url ? { url } : {}) },
          vapid,
        );

        // تنظيف الاشتراكات المنتهية (المستخدم عطّل الإذن أو أزال المتصفح) — لا يُحسب فشلاً
        await deleteSubscriptions(goneIds, token);

        await logNotification(
          {
            title,
            body: message,
            link_url: url ?? null,
            sent_by: caller.userId,
            recipients: subs.length,
            delivered,
            failed,
          },
          token,
        );

        return json({ success: true, total: subs.length, delivered, failed, cleaned: goneIds.length });
      },
    },
  },
});
