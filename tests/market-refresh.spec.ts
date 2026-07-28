import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as marketApi from "@/api/market";
import { useMarketRefresh } from "@/composables/useMarketRefresh";
import { useMarketStore } from "@/stores/market";

vi.mock("@/api/market", () => ({
  getDashboardStatus: vi.fn(),
  refreshDashboard: vi.fn(),
}));

const RefreshHarness = defineComponent({
  setup() {
    const refresh = useMarketRefresh();
    return refresh;
  },
  template: `<span data-test="countdown">{{ countdownLabel }}</span>`,
});

describe("useMarketRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T10:00:00+08:00"));
    setActivePinia(createPinia());
    vi.mocked(marketApi.getDashboardStatus).mockResolvedValue({
      tradeStatus: "TRADING",
      tradeDate: "2026-07-28",
      refreshBatchId: "batch-1",
      lastRefreshAt: "2026-07-28T10:00:00+08:00",
      lastValidDataTime: "2026-07-28T10:00:00+08:00",
      nextRefreshAt: "2026-07-28T10:00:40+08:00",
    });
    vi.mocked(marketApi.refreshDashboard).mockResolvedValue({
      accepted: true,
      refreshBatchId: "batch-2",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("initializes a 40-second countdown and refreshes without overlap", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(RefreshHarness, {
      global: { plugins: [pinia] },
    });
    await flushPromises();

    expect(wrapper.get("[data-test='countdown']").text()).toBe("40s");
    expect(useMarketStore().refreshSignal).toBe(1);

    vi.mocked(marketApi.getDashboardStatus).mockResolvedValue({
      tradeStatus: "TRADING",
      tradeDate: "2026-07-28",
      refreshBatchId: "batch-2",
      lastRefreshAt: "2026-07-28T10:00:40+08:00",
      lastValidDataTime: "2026-07-28T10:00:40+08:00",
      nextRefreshAt: "2026-07-28T10:01:20+08:00",
    });
    const component = wrapper.vm as unknown as {
      manualRefresh: () => Promise<void>;
    };
    const first = component.manualRefresh();
    const second = component.manualRefresh();
    await Promise.all([first, second]);

    expect(marketApi.refreshDashboard).toHaveBeenCalledTimes(1);
    expect(useMarketStore().refreshSignal).toBe(2);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
