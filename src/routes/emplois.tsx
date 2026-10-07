import { createFileRoute } from "@tanstack/react-router";
import emploisHtml from "../legacy/emplois.html?raw";

// صفحة الجداول الدراسية — مسار مستقل مثل /resultats و /moyenne.
export const Route = createFileRoute("/emplois")({
  server: {
    handlers: {
      GET: () =>
        new Response(emploisHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
