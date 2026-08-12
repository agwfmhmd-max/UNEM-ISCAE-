import { createFileRoute } from "@tanstack/react-router";
import resultatsHtml from "../legacy/resultats.html?raw";

// صفحة النتائج — مسار حقيقي داخل التطبيق (يعمل عند الفتح المباشر و Refresh).
export const Route = createFileRoute("/resultats")({
  server: {
    handlers: {
      GET: () =>
        new Response(resultatsHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
