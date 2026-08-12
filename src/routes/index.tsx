import { createFileRoute } from "@tanstack/react-router";
import appHtml from "../legacy/app.html?raw";

// The UNEM ISCAE platform is a single self-contained HTML application.
// It is served verbatim at "/" so the existing design, PWA and logic keep working.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: () =>
        new Response(appHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
