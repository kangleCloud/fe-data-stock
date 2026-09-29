import { AxiosHeaders, type AxiosAdapter } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketSnapshotStream } from "@/composables/useMarketSnapshotStream";
import { SseParser, parseMarketSnapshot, readMarketStream } from "@/utils/marketStream";
import { AUTH_EXPIRED_EVENT, httpClient, requestStream } from "@/utils/request";
import { saveCredential } from "@/utils/storage";

const originalAdapter = httpClient.defaults.adapter;

const moduleOf = (data: unknown, tradeDateBasis: "CALENDAR" | "SOURCE" = "CALENDAR") => ({
  status: "FRESH", tradeDate: "2026-09-22", tradeDateBasis,
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

const top5 = {
  source: "THS", period: "INTRADAY",
  topRise: [], topFall: [], topInflow: [], topOutflow: [],
};

const snapshot = {
  schemaVersion: 1, provider: "akshare", generatedAt: "2026-09-23T10:00:00+08:00",
  modules: {
    industryTop5: moduleOf(top5),
    conceptTop5: moduleOf(top5),
    marketFundFlow: moduleOf({ latest: fundPoint, series: [fundPoint] }, "SOURCE"),
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
    expect(parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf({ ...top5,
        topInflow: [{ sectorName: "测试行业", sectorType: "industry", changePercent: 2.5, netFlowAmount: 123_000_000 }],
      }),
    } }).schemaVersion).toBe(1);
    expect(() => parseMarketSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf({ ...top5, source: "EM" }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: { ...snapshot.modules, conceptTop5: {} } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, marketFundFlow: moduleOf({ latest: { date: "2026-09-22" }, series: [] }, "SOURCE"),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf({ topRise: [], topFall: [], topInflow: [], topOutflow: [], unmatchedFundRows: 1 }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf({ ...top5,
        topInflow: [{ sectorName: "测试行业", sectorType: "industry", changePercent: 2.5, mainNetInflow: 100 }],
      }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf({ ...top5,
        topRise: [{ sectorName: "测试行业", sectorType: "industry", changePercent: 2.5 }],
      }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryTop5: moduleOf(top5, "SOURCE"),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industryHeatmap: moduleOf([]),
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
      ...snapshot.modules, marketFundFlow: moduleOf({ latest: { date: "2026-09-25" }, series: [] }, "SOURCE"),
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

  it("opens the public stream without a token and preserves the admin session on 401", async () => {
    credential();
    const fetchMock = vi.fn().mockResolvedValueOnce(stream(": heartbeat\n\n"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 401, msg: "会话失效" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await requestStream("/market/dashboard/stream", new AbortController().signal, true);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/openapi/api/market/dashboard/stream");
    expect(url).not.toContain("secret");
    expect(new Headers(options.headers).get("X-Token")).toBeNull();
    expect(options.credentials).toBe("omit");
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired, { once: true });
    await expect(requestStream("/market/dashboard/stream", new AbortController().signal, true)).rejects.toMatchObject({ code: 401 });
    expect(expired).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  });

  it("GETs before reconnecting, stops on 403, and aborts on unmount", async () => {
    vi.useFakeTimers();
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
    second.unmount();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pending).toHaveBeenCalledTimes(1);
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
    expect(localStorage.length).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
