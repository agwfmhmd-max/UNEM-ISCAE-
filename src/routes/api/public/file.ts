import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/unem-config";
import {
  buildCloudinaryUrl,
  buildGithubRawUrl,
  isRealCloudinaryUrl,
  readCloudinaryEnv,
  toCloudinaryDownloadUrl,
} from "@/lib/unem-server";

/**
 * نقطة تحويل حقيقية (HTTP 302) نحو الملف مهما كان مصدره.
 *   /api/public/file?id=DOCUMENT_ID              → رابط الفتح
 *   /api/public/file?id=DOCUMENT_ID&download=1   → رابط التنزيل
 * لا تُعيد JSON للملفات الصالحة أبداً — فقط Redirect.
 */

const GITHUB_OWNER = process.env["GITHUB_REPO_OWNER"] ?? "i21567etu-coder";
const GITHUB_REPO = process.env["GITHUB_REPO_NAME"] ?? "UNEM-ISCAE-";

type Row = {
  source: string | null;
  cloudinary_url: string | null;
  cloudinary_public_id: string | null;
  cloudinary_resource_type: string | null;
  github_url: string | null;
  github_path: string | null;
};

export const Route = createFileRoute("/api/public/file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = (url.searchParams.get("id") ?? "").trim();
        const asAttachment = url.searchParams.get("download") === "1";
        const branch = (url.searchParams.get("branch") ?? "main").trim() || "main";
        if (!id) return new Response("معرف الملف مفقود.", { status: 400 });

        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(id)}` +
            `&select=source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,github_url,github_path&limit=1`,
          { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
        );
        if (!res.ok) return new Response("تعذر قراءة بيانات الملف.", { status: 502 });

        const rows = (await res.json()) as Row[];
        const row = rows[0];
        if (!row) return new Response("الملف غير موجود.", { status: 404 });

        // المصدر الحقيقي هو العمود source وليس وجود رابط ما
        const source = (row.source ?? "cloudinary").toLowerCase();

        let target = "";

        if (source === "github") {
          target = (row.github_url ?? "").trim();
          if (!target && row.github_path) {
            target = buildGithubRawUrl(GITHUB_OWNER, GITHUB_REPO, branch, row.github_path);
          }
          if (!target) return new Response("رابط GitHub غير متوفر لهذا الملف.", { status: 409 });
          // raw.githubusercontent يقدّم الملف مباشرة في الحالتين
        } else {
          target = row.cloudinary_url ?? "";
          if (!isRealCloudinaryUrl(target)) {
            // إصلاح فوري: إعادة بناء الرابط من public_id عند وجود رابط خاطئ أو فارغ
            const env = readCloudinaryEnv();
            if (env && row.cloudinary_public_id) {
              target = buildCloudinaryUrl(
                env.cloudName,
                row.cloudinary_public_id,
                row.cloudinary_resource_type ?? "raw",
              );
            }
          }
          if (!isRealCloudinaryUrl(target)) {
            return new Response("رابط Cloudinary غير صالح لهذا الملف.", { status: 409 });
          }
          if (asAttachment) target = toCloudinaryDownloadUrl(target);
        }

        return new Response(null, {
          status: 302,
          headers: { location: target, "cache-control": "no-store" },
        });
      },
    },
  },
});
