# Existing Helpdesk

An ordinary React/TypeScript HTTP ticket page with loading, errors and manual refresh. `index.html` and `src/main.tsx` are the browser entry; `npm run dev` / `npm run build` use Vite. `/api/tickets/:id` is the normal host endpoint; development proxy targets the supplied loopback host API on port 4310. Existing domain functions in `src/tickets.ts` belong to the server, never the browser.

No AE imports, assistant, Agentic tab, model, credentials or runtime are preinstalled. This is a transformation input, not a deployed customer repository or production authentication implementation. In integration tests the enclosing workspace provides reviewed dependencies; the adaptation recipe does not install them.
