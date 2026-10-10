import { AxiosHeaders, type AxiosAdapter } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketSnapshotStream } from "@/composables/useMarketSnapshotStream";
import { applyMarketPatch, parseMarketSnapshot } from "@/utils/marketStream";
import { httpClient } from "@/utils/request";
import { SseParser } from "@/utils/sse";
import { conceptData, coreIndexData, fundData, industryData, moduleOf, snapshot, unknownDateSnapshot } from "./fixtures/marketSnapshot";

const originalAdapter = httpClient.defaults.adapter;
const Probe = { setup: useMarketSnapshotStream,
  template: '<div>{{ snapshot?.snapshotId }} {{ snapshot?.modules.industrySectors.status }} {{ loadError }}</div>' };

function eventStream(frames: string, signal?: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frames));
      signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function adapterFor(values: unknown[]): AxiosAdapter {
  let index = 0;
  return async (config) => ({ data: { success: true, code: 200, content: values[Math.min(index++, values.length - 1)] },
    status: 200, statusText: "OK", headers: new AxiosHeaders(), config });
}

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("market snapshot versions and SSE", () => {
  it.each(["FRESH", "STALE"] as const)("accepts %s source values with unknown dates and empty curves", (status) => {
    const parsed = parseMarketSnapshot(unknownDateSnapshot(status));
    expect(parsed.modules.marketFundFlow.tradeDate).toBeNull();
    expect(parsed.modules.marketFundFlow.data!.latest).toMatchObject({ collectedAt: "2026-10-10T10:00:00+08:00", netAmount: 123_000_000 });
    expect(parsed.modules.marketFundFlow.data!.series).toEqual([]);
    expect(parsed.modules.coreIndices!.data!.items[0]).toMatchObject({ price: 3000.12, collectedAt: "2026-10-10T10:00:00+08:00", series: [] });
    expect(parsed.modules.industrySectors.tradeDate).toBeNull();
    expect(parsed.modules.conceptSectors.tradeDate).toBeNull();
  });

  it.each(["marketFundFlow", "coreIndices"] as const)("rejects %s points without a confirmed date", (key) => {
    const value = unknownDateSnapshot();
    if (key === "marketFundFlow") value.modules.marketFundFlow = { ...snapshot.modules.marketFundFlow, tradeDate: null };
    else value.modules.coreIndices = { ...snapshot.modules.coreIndices!, tradeDate: null };
    expect(() => parseMarketSnapshot(value)).toThrow("市场快照结构或版本无效");
    expect(() => applyMarketPatch(unknownDateSnapshot(), { baseSnapshotId: "u1", snapshotId: "u2",
      generatedAt: value.generatedAt, modules: { [key]: value.modules[key] } })).toThrow();
  });

  it.each(["marketFundFlow", "coreIndices"] as const)("retains known-date same-day checks for %s", (key) => {
    const value = structuredClone(snapshot);
    if (key === "marketFundFlow") value.modules.marketFundFlow.data!.series[0]!.collectedAt = "2026-09-22T09:30:00+08:00";
    else value.modules.coreIndices!.data!.items[0]!.series[0]!.collectedAt = "2026-09-22T10:00:00+08:00";
    expect(() => parseMarketSnapshot(value)).toThrow();
    expect(parseMarketSnapshot(snapshot).modules.marketFundFlow.data!.series).toEqual(fundData.series);
  });

  it("retains source, reconciliation, time and ERROR validation for unknown dates", () => {
    const invalid = [
      (value: ReturnType<typeof unknownDateSnapshot>) => { value.modules.marketFundFlow.lastSuccessAt = null; },
      (value: ReturnType<typeof unknownDateSnapshot>) => { value.modules.marketFundFlow.data!.latest.netAmount = 1; },
      (value: ReturnType<typeof unknownDateSnapshot>) => { value.modules.marketFundFlow.data!.latest.collectedAt = "invalid"; },
      (value: ReturnType<typeof unknownDateSnapshot>) => { value.modules.coreIndices!.data!.items[0]!.collectedAt = "invalid"; },
      (value: ReturnType<typeof unknownDateSnapshot>) => { value.modules.marketFundFlow.status = "ERROR"; },
    ];
    for (const invalidate of invalid) {
      const value = structuredClone(unknownDateSnapshot()); invalidate(value);
      expect(() => parseMarketSnapshot(value)).toThrow();
    }
    const value = unknownDateSnapshot(); value.modules.marketFundFlow = moduleOf<typeof fundData>(null, "ERROR");
    expect(parseMarketSnapshot(value).modules.marketFundFlow.status).toBe("ERROR");
  });

  it.each(["resync", "invalid-null-curve"])("consumes unknown-date GET/patch and realigns on %s without stitching old curves", async (event) => {
    vi.useFakeTimers();
    const unknown = unknownDateSnapshot();
    const historical = { ...snapshot, snapshotId: "u3", generatedAt: "2026-10-10T10:00:02+08:00" };
    let gets = 0; const adapter = adapterFor([unknown, historical]);
    httpClient.defaults.adapter = async (config) => { gets++; return adapter(config); };
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    let connections = 0;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      connections++;
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) {
        stream = controller;
        controller.enqueue(new TextEncoder().encode(frame("ready", { snapshotId: connections === 1 ? "u1" : "u3" })));
        options.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } }));
    }));
    const wrapper = mount(Probe);
    const vm = wrapper.vm as unknown as { snapshot: ReturnType<typeof parseMarketSnapshot> };
    try {
      await flushPromises(); expect(gets).toBe(1); expect(vm.snapshot.modules.marketFundFlow.data!.series).toEqual([]);
      const before = vm.snapshot;
      const patch = { baseSnapshotId: "u1", snapshotId: "u2", generatedAt: "2026-10-10T10:00:01+08:00",
        modules: { marketFundFlow: { ...unknown.modules.marketFundFlow, data: { ...unknown.modules.marketFundFlow.data!,
          latest: { ...unknown.modules.marketFundFlow.data!.latest, inflow: 400_000_000, netAmount: 223_000_000 } } } } };
      stream.enqueue(new TextEncoder().encode(frame("patch", patch) + frame("patch", patch))); await flushPromises();
      expect(vm.snapshot.snapshotId).toBe("u2"); expect(vm.snapshot.modules.marketFundFlow.data!.series).toEqual([]);
      expect(vm.snapshot.modules.industrySectors).toBe(before.modules.industrySectors);
      expect(() => applyMarketPatch(vm.snapshot, { ...patch, baseSnapshotId: "missing", snapshotId: "gap" })).toThrow("版本不连续");
      const recovery = event === "resync" ? frame("resync", {}) : frame("patch", {
        baseSnapshotId: "u2", snapshotId: "bad", generatedAt: patch.generatedAt,
        modules: { coreIndices: { ...snapshot.modules.coreIndices!, tradeDate: null } },
      });
      stream.enqueue(new TextEncoder().encode(recovery)); await flushPromises();
      expect(vm.snapshot.snapshotId).toBe("u2");
      await vi.advanceTimersByTimeAsync(1000); await flushPromises();
      expect(gets).toBe(2); expect(vm.snapshot.snapshotId).toBe("u3");
      expect(vm.snapshot.modules.marketFundFlow.data!.series).toEqual(fundData.series);
      expect(vm.snapshot.modules.coreIndices!.data!.items[0]!.series).toEqual(coreIndexData.items[0]!.series);
      expect(wrapper.text()).not.toContain("结构或版本无效");
    } finally { wrapper.unmount(); }
  });
  it("merges module completions within one timestamp without losing independent times or curves", () => {
    let current = snapshot;
    const fund = snapshot.modules.marketFundFlow.data!;
    const point = { ...fund.latest, collectedAt: "2026-09-23T13:02:04+08:00" };
    const indices = { ...coreIndexData, items: coreIndexData.items.map((item) => ({ ...item,
      collectedAt: "2026-09-23T13:02:05+08:00", price: 3001,
      series: [...item.series, { collectedAt: "2026-09-23T13:02:05+08:00", price: 3001 }] })) };
    const changes = [
      { industrySectors: { ...moduleOf(industryData), lastSuccessAt: "2026-09-23T13:02:03+08:00" } },
      { conceptSectors: { ...moduleOf(conceptData), lastSuccessAt: "2026-09-23T13:02:04+08:00" } },
      { marketFundFlow: { ...moduleOf({ ...fund, latest: point, series: [...fund.series, point] }),
        lastSuccessAt: "2026-09-23T13:02:04+08:00" } },
      { coreIndices: { ...moduleOf(indices), lastSuccessAt: "2026-09-23T13:02:05+08:00" } },
    ];
    for (const [index, modules] of changes.entries()) {
      const next = applyMarketPatch(current, { baseSnapshotId: current.snapshotId,
        snapshotId: `s${index + 2}`, generatedAt: snapshot.generatedAt, modules });
      if (next === "duplicate") throw new Error("unexpected duplicate");
      expect(applyMarketPatch(next, { baseSnapshotId: current.snapshotId,
        snapshotId: `s${index + 2}`, generatedAt: snapshot.generatedAt, modules })).toBe("duplicate");
      current = next;
    }
    expect(current.snapshotId).toBe("s5");
    expect(current.modules.industrySectors.lastSuccessAt).toBe("2026-09-23T13:02:03+08:00");
    expect(current.modules.conceptSectors.lastSuccessAt).toBe("2026-09-23T13:02:04+08:00");
    expect(current.modules.marketFundFlow.data?.series).toEqual([...fund.series, point]);
    expect(current.modules.coreIndices?.data?.items[0]?.series).toEqual(indices.items[0]?.series);
  });
  it("parses split SSE frames and validates old snapshots plus reconciled net amounts", () => {
    const frames: Array<{ event: string; data: string }> = [];
    const parser = new SseParser((item) => frames.push(item));
    parser.push(": heart");
    parser.push("beat\n\nevent: ready\ndata: {\"snapshotId\":\"s1\"}\n\n");
    expect(frames).toEqual([{ event: "ready", data: '{"snapshotId":"s1"}' }]);
    parser.push("event: resync\n\n");
    expect(frames[1]).toEqual({ event: "resync", data: "" });
    expect(parseMarketSnapshot(snapshot).snapshotId).toBe("s1");
    expect(parseMarketSnapshot(snapshot).modules.marketFundFlow.data?.reconciledFromLegacy).toBe(true);
    expect(parseMarketSnapshot(snapshot).modules.coreIndices?.data?.items[0]?.code).toBe("sh000001");
    const legacy = { ...snapshot } as Record<string, unknown>;
    delete legacy.snapshotId;
    expect(parseMarketSnapshot(legacy).snapshotId).toBeNull();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, marketFundFlow: moduleOf({ ...snapshot.modules.marketFundFlow.data,
        latest: { ...snapshot.modules.marketFundFlow.data!.latest, netAmount: 1 },
      }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, industrySectors: moduleOf({ ...industryData, source: "EM" }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, coreIndices: moduleOf({ ...coreIndexData, source: "EM" }),
    } })).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot, modules: {
      ...snapshot.modules, coreIndices: moduleOf({ ...coreIndexData,
        items: [coreIndexData.items[0], coreIndexData.items[0]] }),
    } })).toThrow();
  });

  it("atomically merges changed modules, ignores duplicates and rejects gaps or bad shapes", () => {
    const patch = { baseSnapshotId: "s1", snapshotId: "s2", generatedAt: "2026-09-23T13:03:00+08:00",
      modules: { industrySectors: moduleOf(industryData, "STALE") } };
    const next = applyMarketPatch(snapshot, patch);
    expect(next).not.toBe("duplicate");
    if (next === "duplicate") return;
    expect(next.snapshotId).toBe("s2");
    expect(next.modules.industrySectors.status).toBe("STALE");
    expect(next.modules.conceptSectors).toEqual(snapshot.modules.conceptSectors);
    expect(next.modules.coreIndices).toEqual(snapshot.modules.coreIndices);
    expect(snapshot.modules.industrySectors.status).toBe("FRESH");
    expect(applyMarketPatch(next, patch)).toBe("duplicate");
    expect(() => applyMarketPatch(next, { ...patch, snapshotId: "s3" })).toThrow("版本不连续");
    expect(() => applyMarketPatch(snapshot, { ...patch, modules: { unknown: {} } })).toThrow();
    const heartbeat = applyMarketPatch(snapshot, { ...patch, modules: {} });
    expect(heartbeat).not.toBe("duplicate");
    if (heartbeat !== "duplicate") expect(heartbeat.modules).toEqual(snapshot.modules);
    const legacy = parseMarketSnapshot({ ...snapshot, snapshotId: null });
    const fromLegacy = applyMarketPatch(legacy, { ...patch, baseSnapshotId: null });
    expect(fromLegacy).not.toBe("duplicate");
  });

  it("GETs before ready, resyncs on a ready version race, and reconnects", async () => {
    vi.useFakeTimers();
    const second = { ...snapshot, snapshotId: "s2", generatedAt: "2026-09-23T13:03:00+08:00" };
    let gets = 0;
    const adapter = adapterFor([snapshot, second]);
    httpClient.defaults.adapter = async (config) => { gets += 1; return adapter(config); };
    const fetchMock = vi.fn((_url: string, options: RequestInit) => Promise.resolve(
      eventStream(frame("ready", { snapshotId: "s2" }), options.signal as AbortSignal),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(Probe);
    try {
      await flushPromises();
      expect(gets).toBe(1);
      expect(wrapper.text()).not.toContain("版本不一致");
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();
      expect(gets).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain("s2");
      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toBe("/openapi/api/market/dashboard/stream");
      expect(new Headers(options.headers).has("X-Token")).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it("applies patches, avoids periodic GET, and manually GETs before rebuilding the stream", async () => {
    vi.useFakeTimers();
    let gets = 0;
    const adapter = adapterFor([snapshot]);
    httpClient.defaults.adapter = async (config) => { gets += 1; return adapter(config); };
    const frames = frame("ready", { snapshotId: "s1" }) + frame("patch", {
      baseSnapshotId: "s1", snapshotId: "s2", generatedAt: "2026-09-23T13:03:00+08:00",
      modules: { industrySectors: moduleOf(industryData, "STALE") },
    });
    const fetchMock = vi.fn((_url: string, options: RequestInit) => Promise.resolve(
      eventStream(frames, options.signal as AbortSignal),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(Probe);
    try {
      await flushPromises();
      expect(wrapper.text()).toContain("s2 STALE");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(gets).toBe(1);
      await (wrapper.vm as unknown as { manualRefresh: () => Promise<void> }).manualRefresh();
      await flushPromises();
      expect(gets).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { wrapper.unmount(); }
  });
});
