import { createFileRoute } from "@tanstack/react-router";
import { authenticateCaller, bearerToken, json } from "@/lib/unem-server";
import { readVapidEnv, sendPushNotification, type StoredPushSubscription } from "@/lib/unem-push";
import { isFcmConfigured, sendFcmNotification, type FcmTokenRow } from "@/lib/unem-fcm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/unem-config";

const MAX_TITLE = 120;
const MAX_BODY = 500;
const CONCURRENCY = 25;
const ANDROID_APP_ID = "mr.unem.iscae";

type PushPayload = { title: string; body: string; url?: string };
type DeliveryResult = { delivered: number; failed: number; goneIds: string[] };

async function fetchAllSubscriptions(token: string): Promise<StoredPushSubscription[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  return (await res.json()) as StoredPushSubscription[];
}

async function fetchAllFcmTokens(token: string): Promise<FcmTokenRow[]> {
  const query =
    `${SUPABASE_URL}/rest/v1/fcm_tokens?select=id,token` +
    `&platform=eq.android&app_id=eq.${encodeURIComponent(ANDROID_APP_ID)}`;
  const res = await fetch(query, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as FcmTokenRow[];
}

async function deleteSubscriptions(ids: string[], token: string): Promise<void> {
  if (ids.length === 0) return;
  const filter = ids.map((id) => `"${id}"`).join(",");
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${filter})`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
  }).catch(() => null);
}

async function deleteFcmTokens(ids: string[], token: string): Promise<void> {
  if (ids.length === 0) return;
  const filter = ids.map((id) => `"${id}"`).join(",");
  await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?id=in.(${filter})`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
  }).catch(() => null);
}

async function logNotification(
  row: {
    title: string;
    body: string;
    link_url: string | null;
    sent_by: string;
    recipients: number;
    delivered: number;
    failed: number;
    expired: number;
  },
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

/** يرسل Web Push على مجموعات صغيرة لتفادي إغراق الشبكة بعدد كبير من الطلبات المتوازية. */
async function sendWebPushInBatches(
  subs: StoredPushSubscription[],
  payload: PushPayload,
  vapid: NonNullable<ReturnType<typeof readVapidEnv>>,
): Promise<DeliveryResult> {
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

/** يرسل رسائل FCM إلى أجهزة Android المسجلة، ويحذف الرموز التي أبلغت Firebase أنها انتهت. */
async function sendFcmInBatches(
  tokens: FcmTokenRow[],
  payload: PushPayload,
): Promise<DeliveryResult> {
  let delivered = 0;
  let failed = 0;
  const goneIds: string[] = [];

  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const batch = tokens.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (row) => ({ row, outcome: await sendFcmNotification(row.token, payload) })),
    );
    for (const { row, outcome } of results) {
      if (outcome === "ok") delivered += 1;
      else if (outcome === "gone") goneIds.push(row.id);
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
        const fcmConfigured = isFcmConfigured();
        if (!vapid && !fcmConfigured) {
          return json(
            {
              error:
                "❌ إعدادات الإشعارات غير مكتملة: أضف VAPID أو إعدادات Firebase FCM على الخادم.",
            },
            500,
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "❌ طلب غير صالح." }, 400);
        }

        const title = String(body["title"] ?? "")
          .trim()
          .slice(0, MAX_TITLE);
        const message = String(body["body"] ?? "")
          .trim()
          .slice(0, MAX_BODY);
        const rawUrl = String(body["url"] ?? "").trim();

        if (!title) return json({ error: "❌ عنوان الإشعار مطلوب." }, 400);
        if (!message) return json({ error: "❌ نص الإشعار مطلوب." }, 400);
        if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
          return json({ error: "❌ الرابط غير صالح (يجب أن يبدأ بـ https://)." }, 400);
        }
        const url = rawUrl || undefined;
        const payload = { title, body: message, ...(url ? { url } : {}) };

        const subs = vapid ? await fetchAllSubscriptions(token) : [];
        const fcmTokens = fcmConfigured ? await fetchAllFcmTokens(token) : [];
        if (subs.length === 0 && fcmTokens.length === 0) {
          await logNotification(
            {
              title,
              body: message,
              link_url: url ?? null,
              sent_by: caller.userId,
              recipients: 0,
              delivered: 0,
              failed: 0,
              expired: 0,
            },
            token,
          );
          return json({
            success: true,
            total: 0,
            delivered: 0,
            failed: 0,
            web_delivered: 0,
            fcm_delivered: 0,
            fcm_configured: fcmConfigured,
            message: "لا يوجد مشتركون في الإشعارات حالياً.",
          });
        }

        const webResult = vapid
          ? await sendWebPushInBatches(subs, payload, vapid)
          : { delivered: 0, failed: 0, goneIds: [] };
        const fcmResult = fcmConfigured
          ? await sendFcmInBatches(fcmTokens, payload)
          : { delivered: 0, failed: 0, goneIds: [] };

        await deleteSubscriptions(webResult.goneIds, token);
        await deleteFcmTokens(fcmResult.goneIds, token);

        const delivered = webResult.delivered + fcmResult.delivered;
        const failed = webResult.failed + fcmResult.failed;
        const expired = webResult.goneIds.length + fcmResult.goneIds.length;
        const total = subs.length + fcmTokens.length;
        await logNotification(
          {
            title,
            body: message,
            link_url: url ?? null,
            sent_by: caller.userId,
            recipients: total,
            delivered,
            failed,
            expired,
          },
          token,
        );

        return json({
          success: true,
          total,
          delivered,
          failed,
          expired,
          web_expired: webResult.goneIds.length,
          fcm_expired: fcmResult.goneIds.length,
          web_delivered: webResult.delivered,
          fcm_delivered: fcmResult.delivered,
          fcm_configured: fcmConfigured,
          cleaned: webResult.goneIds.length + fcmResult.goneIds.length,
        });
      },
    },
  },
});
