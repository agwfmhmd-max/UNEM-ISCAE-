import { createFileRoute } from "@tanstack/react-router";
import { json, readCloudinaryEnv } from "@/lib/unem-server";

/**
 * إعدادات Cloudinary العمومية فقط (اسم السحابة) — لا يحتوي أي سر.
 * تستعملها الواجهة لإعادة بناء روابط التسليم عند غياب cloudinary_url.
 */
export const Route = createFileRoute("/api/public/cloudinary/config")({
  server: {
    handlers: {
      GET: () => {
        const env = readCloudinaryEnv();
        if (!env) return json({ cloudName: null }, 200);
        return json({ cloudName: env.cloudName });
      },
    },
  },
});
