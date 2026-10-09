import { flushPromises, mount } from "@vue/test-utils";
import { shallowRef, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import BaseChart from "@/components/market/BaseChart.vue";
import Overview from "@/views/market/overview/index.vue";
import { buildStockPriceOption } from "@/charts/marketOptions";
import { shareSnapshot } from "@/utils/snapshotSharing";
import { snapshot as fixture } from "./fixtures/marketSnapshot";

const mocks = vi.hoisted(() => ({ render: vi.fn(), init: vi.fn() }));
vi.mock("@/charts/echarts", () => ({ echarts: { init: mocks.init } }));
const state = shallowRef(structuredClone(fixture));
const error = ref("");
vi.mock("@/composables/useMarketSnapshotStream", () => ({ useMarketSnapshotStream: () => ({
  snapshot: state, loading: ref(false), loadError: error, manualRefresh: vi.fn(),
}) }));
afterEach(() => { vi.clearAllMocks(); error.value = ""; });

describe("stable live charts", () => {
  it("does not re-render charts for equal GETs, status changes, errors or another module", async () => {
    state.value = structuredClone(fixture);
    mocks.init.mockImplementation(() => ({ setOption: mocks.render, on: vi.fn(), resize: vi.fn(), dispose: vi.fn() }));
    const wrapper = mount(Overview);
    try {
      await flushPromises(); const initial = mocks.render.mock.calls.length;
      expect(initial).toBeGreaterThan(1);
      const chartNodes = wrapper.findAll(".base-chart").map((node) => node.element);
      const slot = wrapper.get(".snapshot-connection-status").element;
      state.value = shareSnapshot(state.value, structuredClone(state.value)); await flushPromises();
      expect(mocks.render).toHaveBeenCalledTimes(initial);
      const changed = structuredClone(state.value);
      changed.modules.industrySectors.status = "STALE"; changed.modules.industrySectors.message = "本次失败";
      state.value = shareSnapshot(state.value, changed); error.value = "HTTP 502"; await flushPromises();
      expect(mocks.render).toHaveBeenCalledTimes(initial);
      expect(wrapper.get(".snapshot-connection-status").element).toBe(slot);
      expect(wrapper.findAll(".base-chart").map((node) => node.element)).toEqual(chartNodes);
      const other = structuredClone(state.value); other.modules.conceptSectors.lastAttemptAt = "2026-09-23T13:03:00+08:00";
      state.value = shareSnapshot(state.value, other); error.value = ""; await flushPromises();
      expect(mocks.render).toHaveBeenCalledTimes(initial);
      const updated = structuredClone(state.value);
      updated.modules.coreIndices!.data!.items[0]!.series.push({ collectedAt: "2026-09-23T13:03:00+08:00", price: 3001 });
      state.value = shareSnapshot(state.value, updated); await flushPromises();
      expect(mocks.render).toHaveBeenCalledTimes(initial + 1);
    } finally { wrapper.unmount(); }
  });

  it("merges stable series IDs and removes obsolete curve segments", async () => {
    mocks.init.mockReturnValue({ setOption: mocks.render, on: vi.fn(), resize: vi.fn(), dispose: vi.fn() });
    const points = [{ time: "2026-10-09T09:30:00+08:00", price: 1 }, { time: "2026-10-09T13:00:00+08:00", price: 2 }];
    const wrapper = mount(BaseChart, { props: { option: buildStockPriceOption(points), accessibleLabel: "价格" } });
    try {
      await flushPromises(); expect(mocks.render.mock.calls[0]![0].series).toHaveLength(2);
      await wrapper.setProps({ option: buildStockPriceOption(points.slice(0, 1)) });
      expect(mocks.render.mock.calls[1]![0].series).toHaveLength(1);
      expect(mocks.render.mock.calls[1]![1]).toMatchObject({ notMerge: false, replaceMerge: ["series"] });
      expect(mocks.render.mock.calls[1]![0].series[0].id).toBe("segment-0");
      expect(mocks.render.mock.calls[1]![0].animation).toBe(false);
    } finally { wrapper.unmount(); }
  });
});
