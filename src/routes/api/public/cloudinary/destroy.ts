import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateCaller,
  bearerToken,
  deleteDocumentRow,
  fetchDocumentRow,
  json,
  readCloudinaryEnv,
  signCloudinaryParams,
} from "@/lib/unem-server";


async function destroyCloudinaryAsset(
  publicId: string,
  resourceType: string,
  env: { cloudName: string; apiKey: string; apiSecret: string },
): Promise<boolean> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signCloudinaryParams(
    { invalidate: "true", public_id: publicId, timestamp },
    env.apiSecret,
  );
  const form = new FormData();
  form.set("public_id", publicId);
  form.set("timestamp", timestamp);
  form.set("api_key", env.apiKey);
  form.set("signature", signature);
  form.set("invalidate", "true");
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${env.cloudName}/${resourceType}/destroy`,
    { method: "POST", body: form },
  );
  if (!res.ok) return false;
  const result = (await res.json().catch(() => ({}))) as { result?: string };
  return result.result === "ok" || result.result === "not found";
}

export const Route = createFileRoute("/api/public/cloudinary/destroy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;

        const canDelete = auth.caller.role === "admin";
        const canUpload = canDelete || auth.caller.role === "uploader";
        if (!canUpload) {
          return json({ error: "❌ ليس لديك صلاحية لحذف الملفات." }, 403);
        }

        const token = bearerToken(request);
        if (!token) return json({ error: "❌ جلسة غير صالحة." }, 401);

        const env = readCloudinaryEnv();
        if (!env) return json({ error: "❌ إعدادات Cloudinary غير مكتملة على الخادم." }, 500);

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "❌ طلب غير صالح." }, 400);
        }

        const documentId = String(body["documentId"] ?? "").trim();
        const orphanPublicId = String(body["orphanPublicId"] ?? "").trim();

        // حالة خاصة: تنظيف ملف يتيم (نجح رفعه إلى Cloudinary وفشل تسجيله في قاعدة البيانات).
        // مسموح لمن يملك صلاحية الرفع، ولا يمس أي سجل في قاعدة البيانات.
        if (!documentId && orphanPublicId) {
          const orphanType = ["raw", "image", "video"].includes(
            String(body["resourceType"] ?? ""),
          )
            ? String(body["resourceType"])
            : "raw";
          const ok = await destroyCloudinaryAsset(orphanPublicId, orphanType, env);
          return ok
            ? json({ success: true, cleanedPublicId: orphanPublicId })
            : json({ error: "❌ تعذر تنظيف الملف اليتيم من Cloudinary." }, 502);
        }

        if (!documentId) return json({ error: "❌ معرف السجل مفقود." }, 400);
        if (!canDelete) return json({ error: "❌ ليس لديك صلاحية لحذف الملفات." }, 403);

        // 1) نقرأ السجل من قاعدة البيانات — لا نثق بأي public_id قادم من الواجهة
        const row = await fetchDocumentRow(documentId, token);
        if (!row) return json({ error: "❌ لم يتم العثور على الملف في قاعدة البيانات." }, 404);

        const publicId = (row.cloudinary_public_id ?? "").trim();
        const resourceType = ["raw", "image", "video"].includes(row.cloudinary_resource_type ?? "")
          ? (row.cloudinary_resource_type as string)
          : "raw";

        // 2) حذف الأصل من Cloudinary (إن وُجد معرف صالح)
        if (publicId) {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signature = await signCloudinaryParams(
            { invalidate: "true", public_id: publicId, timestamp },
            env.apiSecret,
          );

          const form = new FormData();
          form.set("public_id", publicId);
          form.set("timestamp", timestamp);
          form.set("api_key", env.apiKey);
          form.set("signature", signature);
          form.set("invalidate", "true");

          const res = await fetch(
            `https://api.cloudinary.com/v1_1/${env.cloudName}/${resourceType}/destroy`,
            { method: "POST", body: form },
          );
          const result = (await res.json().catch(() => ({}))) as {
            result?: string;
            error?: { message?: string };
          };

          if (!res.ok) {
            return json(
              { error: `❌ فشل حذف الملف من Cloudinary: ${result.error?.message ?? res.status}` },
              502,
            );
          }
          if (result.result !== "ok" && result.result !== "not found") {
            return json({ error: `❌ فشل حذف الملف من Cloudinary: ${result.result}` }, 502);
          }
        }

        // 3) حذف السجل من قاعدة البيانات
        const deleted = await deleteDocumentRow(documentId, token);
        if (!deleted) {
          return json({ error: "❌ تم حذف الملف من Cloudinary لكن تعذر حذف السجل." }, 500);
        }

        return json({ success: true, deletedId: documentId });
      },
    },
  },
});
