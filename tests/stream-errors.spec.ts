import { afterEach, describe, expect, it, vi } from "vitest";
import { requestStream, StreamResponseError } from "@/utils/request";

afterEach(() => vi.unstubAllGlobals());
describe("SSE response diagnostics", () => {
  it.each([
    [200, "text/html", "<html>SPA</html>", "html", undefined],
    [503, "application/json", '{"code":423,"msg":"服务繁忙"}', "json", 423],
    [403, "text/plain", "forbidden", "http", 403],
    [200, "application/octet-stream", "other", "non-sse", undefined],
    [200, "text/event-stream", null, "missing-body", undefined],
  ] as const)("classifies HTTP %s / %s", async (httpStatus, contentType, body, classification, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: httpStatus, headers: { "Content-Type": contentType } })));
    let failure: unknown;
    try { await requestStream("/market/dashboard/stream", new AbortController().signal, true); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(StreamResponseError);
    expect(failure).toMatchObject({ httpStatus, contentType, classification, code });
    expect((failure as Error).message).toContain(`HTTP ${httpStatus}`);
    expect((failure as Error).message).not.toContain("<html>");
  });
});
