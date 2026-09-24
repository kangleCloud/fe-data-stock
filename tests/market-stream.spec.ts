import { AxiosHeaders, type AxiosAdapter } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketSnapshotStream } from "@/composables/useMarketSnapshotStream";
import { SseParser, parseMarketSnapshot, readMarketStream } from "@/utils/marketStream";
import { AUTH_EXPIRED_EVENT, httpClient, requestStream } from "@/utils/request";
import { clearCredential, saveCredential } from "@/utils/storage";

const originalAdapter = httpClient.defaults.adapter;

const moduleOf = (data: unknown) => ({
  status: "FRESH", tradeDate: "2026-09-22", tradeDateBasis: "SOURCE",
  lastSuccessAt: "2026-09-23T10:00:00+08:00", lastAttemptAt: "2026-09-23T10:00:00+08:00",
  message: null, data,
});

const fundPoint = {
  date: "2026-09-22", mainNetInflow: 1, mainNetInflowRatio: 0.1,
  superLargeNetInflow: null, superLargeNetInflowRatio: null,
  largeNetInflow: null, largeNetInflowRatio: null,
  mediumNetInflow: null, mediumNetInflowRatio: null,
  smallNetInflow: null, smallNetInflowRatio: null,
  shanghaiClose: null, shanghaiChangePercent: null,
  shenzhenClose: null, shenzhenChangePercent: null,
};

const snapshot = {
  schemaVersion: 1, provider: "akshare", generatedAt: "2026-09-23T10:00:00+08:00",
  modules: {
    industryHeatmap: moduleOf([]), conceptHeatmap: moduleOf([]),
    industryTop5: moduleOf({ topRise: [], topFall: [], topInflow: [], topOutflow: [], unmatchedFundRows: 0 }),
    conceptTop5: moduleOf({ topRise: [], topFall: [], topInflow: [], topOutflow: [], unmatchedFundRows: 0 }),
    marketFundFlow: moduleOf({ latest: fundPoint, series: [fundPoint] }),
  },
};

function credential(): void {
  saveCredential({ tokenName: "X-Token", tokenPrefix: "Bearer", tokenValue: "secret", expiresIn: 3600, userId: 1, username: "tester", nickName: "Tester" });
}

function stream(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=UTF-8" } });
}

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("market snapshot stream", () => {
  it("parses split SSE frames and ignores comments and non-snapshot events", async () => {
    const frames: Array<{ event: string; data: string }> = [];
    const parser = new SseParser((frame) => frames.push(frame));
    parser.push(": heart");
    parser.push("beat\n\nevent: snapshot\ndata: {\"schemaVersion\":1}\n\n");
    expect(frames).toEqual([{ event: "snapshot", data: '{"schemaVersion":1}' }]);

    const accepted: unknown[] = [];
    const errors: Error[] = [];
    await readMarketStream(stream(`: heartbeat\n\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\nevent: snapshot\ndata: {bad}\n\n`),
      (value) => accepted.push(value), (error) => errors.push(error));
    expect(accepted).toEqual([snapshot]);
    expect(errors).toHaveLength(1);
    expect(() => parseMarketSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: { ...snapshot.modules, conceptTop5: {} } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, marketFundFlow: moduleOf({ latest: { date: "2026-09-22" }, series: [] }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf({ topRise: [], topFall: [], topInflow: [], topOutflow: [] }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryHeatmap: moduleOf([{ sectorCode: "BK1", sectorName: "行业" }]),
    } })).toThrow();
  });

  it("keeps the last valid snapshot when a later stream event lacks required fields", async () => {
    credential();
    httpClient.defaults.adapter = (async (config) => ({
      data: { success: true, code: 200, content: snapshot }, status: 200,
      statusText: "OK", headers: new AxiosHeaders(), config,
    })) as AxiosAdapter;
    const valid = { ...snapshot, generatedAt: "2026-09-24T10:00:00+08:00" };
    const invalid = { ...snapshot, generatedAt: "2026-09-25T10:00:00+08:00", modules: {
      ...snapshot.modules, marketFundFlow: moduleOf({ latest: { date: "2026-09-25" }, series: [] }),
    } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stream(
      `event: snapshot\ndata: ${JSON.stringify(valid)}\n\nevent: snapshot\ndata: ${JSON.stringify(invalid)}\n\n`,
    )));
    const Probe = { setup: useMarketSnapshotStream, template: '<div>{{ snapshot?.generatedAt }} {{ loadError }}</div>' };
    const wrapper = mount(Probe);
    await flushPromises();
    expect(wrapper.text()).toContain("2026-09-24T10:00:00+08:00");
    expect(wrapper.text()).not.toContain("2026-09-25T10:00:00+08:00");
    expect(wrapper.text()).toContain("市场快照结构或版本无效");
    wrapper.unmount();
  });

  it("sends the existing token in a header and expires the session on 401", async () => {
    credential();
    const fetchMock = vi.fn().mockResolvedValueOnce(stream(": heartbeat\n\n"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 401, msg: "会话失效" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await requestStream("/market/dashboard/stream", new AbortController().signal);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/admin/api/market/dashboard/stream");
    expect(url).not.toContain("secret");
    expect(new Headers(options.headers).get("X-Token")).toBe("Bearer secret");
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired, { once: true });
    await expect(requestStream("/market/dashboard/stream", new AbortController().signal)).rejects.toMatchObject({ code: 401 });
    expect(expired).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
  });

  it("GETs before reconnecting, stops on 403, and aborts on unmount", async () => {
    vi.useFakeTimers();
    credential();
    let gets = 0;
    httpClient.defaults.adapter = (async (config) => {
      gets += 1;
      return { data: { success: true, code: 200, content: snapshot }, status: 200,
        statusText: "OK", headers: new AxiosHeaders(), config };
    }) as AxiosAdapter;
    const fetchMock = vi.fn().mockResolvedValueOnce(stream(": heartbeat\n\n"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 403, msg: "没有访问权限" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const Probe = { setup: useMarketSnapshotStream, template: '<div>{{ snapshot?.generatedAt }} {{ loadError }}</div>' };
    const wrapper = mount(Probe);
    await flushPromises();
    expect(gets).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(gets).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("无权查看市场快照");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();

    const pending = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", pending);
    const second = mount(Probe);
    await flushPromises();
    const signal = pending.mock.calls[0]![1].signal;
    clearCredential();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pending).toHaveBeenCalledTimes(1);
    credential();
    await flushPromises();
    expect(pending).toHaveBeenCalledTimes(2);
    const replacementSignal = pending.mock.calls[1]![1].signal;
    second.unmount();
    expect(replacementSignal?.aborted).toBe(true);
  });

  it("stops the live subscription after a 401 handshake", async () => {
    vi.useFakeTimers();
    credential();
    httpClient.defaults.adapter = (async (config) => ({
      data: { success: true, code: 200, content: snapshot }, status: 200,
      statusText: "OK", headers: new AxiosHeaders(), config,
    })) as AxiosAdapter;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, code: 401, msg: "认证失败" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const Probe = { setup: useMarketSnapshotStream, template: '<div>{{ snapshot?.generatedAt }}</div>' };
    const wrapper = mount(Probe);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
