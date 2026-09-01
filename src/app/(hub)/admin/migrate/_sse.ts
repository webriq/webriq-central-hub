// Shared reader for the "data: {...}\n\n" SSE streams every zoho-export / zoho-import route emits.
// Extracted in task 342 so new migrate cards don't re-copy the reader loop into the 2,500-line tab file.
export async function readSSEStream(
  res: Response,
  onEvent: (evt: Record<string, unknown> & { type: string }) => void,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      if (!frame.startsWith("data: ")) continue;
      onEvent(JSON.parse(frame.slice(6)) as Record<string, unknown> & { type: string });
    }
  }
}
