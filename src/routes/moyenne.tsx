import { createFileRoute } from "@tanstack/react-router";
import moyenneHtml from "../legacy/moyenne.html?raw";

// صفحة حساب المعدل — مسار حقيقي داخل التطبيق (يعمل عند الفتح المباشر و Refresh).
export const Route = createFileRoute("/moyenne")({
  server: {
    handlers: {
      GET: () =>
        new Response(moyenneHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
