import type { MergeEvent } from "@/lib/projects/merge/types";

/** POST JSON and invoke `onEvent` for every NDJSON line as it arrives. Throws on a non-stream (HTTP error) response. */
export async function streamNdjson(url: string, body: unknown, onEvent: (e: MergeEvent) => void, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as MergeEvent);
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as MergeEvent);
}
