export interface SseFrame { event: string; data: string }

export class SseParser {
  private buffer = "";
  private event = "message";
  private data: string[] = [];

  constructor(private readonly onFrame: (frame: SseFrame) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    let end = this.buffer.indexOf("\n");
    while (end !== -1) {
      const line = this.buffer.slice(0, end).replace(/\r$/, "");
      this.buffer = this.buffer.slice(end + 1);
      if (!line) {
        if (this.data.length || this.event !== "message") this.onFrame({ event: this.event, data: this.data.join("\n") });
        this.event = "message";
        this.data = [];
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const name = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (name === "event") this.event = value;
        if (name === "data") this.data.push(value);
      }
      end = this.buffer.indexOf("\n");
    }
  }
}

export async function readEventStream(
  response: Response, onFrame: (frame: SseFrame) => void, onActivity: () => void,
): Promise<void> {
  if (!response.body) throw new Error("事件流响应为空");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser(onFrame);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      onActivity();
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
