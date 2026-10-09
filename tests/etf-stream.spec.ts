import { AxiosHeaders } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEtfMonitorStream } from "@/composables/useEtfMonitorStream";
import { httpClient } from "@/utils/request";

const originalAdapter = httpClient.defaults.adapter;
const item = { symbol: "SH510050", code: "510050", name: "50ETF", market: "SH", sortOrder: 1,
  profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null,
    manager: null, custodian: null, shareCount: null, shareDate: null, trackingIndexCode: null,
    trackingIndexName: null, updatedAt: null }, quote: null, series: [], fundSeries: [],
  fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate: null, dataStatus: "NO_DATA",
  closeConfirmed: false, assetAllocation: null };
const Probe = { setup: useEtfMonitorStream, template: "<div>{{ snapshot?.stateId }} {{ snapshot?.etfs.length }} {{ snapshot?.etfs[0]?.profile.source }} {{ snapshot?.etfs[0]?.profile.establishedDate }} {{ snapshot?.etfs[0]?.assetAllocationStatus }} {{ snapshot?.etfs[0]?.assetAllocation?.collectedAt }} {{ loadError }}</div>" };

afterEach(() => { httpClient.defaults.adapter = originalAdapter; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("ETF configuration stream resync", () => {
  it.each(["patch", "resync", "profile-resync", "allocation-resync"])("re-GETs full state on %s and keeps reads timer-free", async (event) => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    let gets = 0;
    httpClient.defaults.adapter = async (config) => {
      gets++;
      const content = { schemaVersion: 1, stateId: gets === 1 ? "q1" : "q2", xqEnabled: event === "allocation-resync",
        tradeDate: null, etfs: gets === 1 ? [item] : event === "profile-resync" ? [{ ...item,
          profile: { ...item.profile, source: "THS", establishedDate: "2020-01-02",
            fullName: "示例基金全称", updatedAt: "2026-10-03T10:00:00+08:00" } }] : event === "allocation-resync" ? [{ ...item,
          assetAllocationStatus: "AVAILABLE", assetAllocation: { source: "XQ_DANJUAN", requestedReportPeriod: "2026-06-30",
            collectedAt: "2026-10-09T10:00:00+08:00", categories: [{ category: "股票", percent: 90 }] } }] : [] };
      return { data: { success: true, content }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    };
    let streams = 0;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      streams++;
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) {
        const ready = `event: ready\ndata: {"stateId":"${streams === 1 ? "q1" : "q2"}"}\n\n`;
        const changed = event !== "patch" ? "event: resync\ndata: {}\n\n" :
          `event: patch\ndata: ${JSON.stringify({ baseStateId: "q1", stateId: "q2", etfs: [{ ...item, sortOrder: 2 }] })}\n\n`;
        controller.enqueue(new TextEncoder().encode(ready + (streams === 1 ? changed : "")));
        options.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } }));
    });
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount(Probe);
    try {
      await flushPromises(); expect(gets).toBe(1);
      await vi.advanceTimersByTimeAsync(1000); await flushPromises();
      expect(gets).toBe(2);
      expect(wrapper.text()).toContain(event === "profile-resync" ? "q2 1 THS 2020-01-02" : event === "allocation-resync" ? "q2 1" : "q2 0");
      if (event === "allocation-resync") expect(wrapper.text()).toContain("AVAILABLE 2026-10-09T10:00:00+08:00");
      expect(fetch.mock.calls[0]?.[0]).toBe("/openapi/api/etf-monitor/v1/stream");
      await vi.advanceTimersByTimeAsync(10000); expect(gets).toBe(2);
    } finally { wrapper.unmount(); }
  });
});
