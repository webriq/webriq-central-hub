// Task 468 — NDJSON response helper: one JSON event per line, flushed as the server produces it.
import type { MergeEvent } from "./types";

export function ndjsonResponse(run: (emit: (e: MergeEvent) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (e: MergeEvent) => {
        if (!closed) controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      };
      try {
        await run(emit);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform" } });
}
