import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEtfMonitorDashboard, getEtfProfileDetail, getEtfProfilePage } from "@/api/etf";
import ProfileView from "@/views/system/etfProfile/index.vue";

const route = reactive({ query: { symbol: "SH510050" } });
vi.mock("vue-router", () => ({ useRoute: () => route }));
vi.mock("@/api/etf", () => ({ getEtfMonitorDashboard: vi.fn(), getEtfProfileDetail: vi.fn(), getEtfProfilePage: vi.fn() }));

function mountView() {
  return shallowMount(ProfileView, { global: { renderStubDefaultSlot: true,
    stubs: { RouterLink: true, ElTableColumn: { template: "<span />" } },
    directives: { loading: () => {} } } });
}

beforeEach(() => {
  vi.resetAllMocks();
  route.query.symbol = "SH510050";
  vi.mocked(getEtfProfilePage).mockResolvedValue({ list: [], total: 0 });
  vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: "50ETF" } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
  vi.mocked(getEtfMonitorDashboard).mockResolvedValue({ schemaVersion: 1, stateId: null, xqEnabled: false, tradeDate: null, etfs: [] });
});

describe("ETF profile cached quote", () => {
  it("shows an unmonitored empty state and uses only cache GETs", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("该 ETF 未启用监控");
    expect(getEtfProfileDetail).toHaveBeenCalledExactlyOnceWith("SH510050");
    expect(getEtfMonitorDashboard).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("keeps profile data when public cache fails", async () => {
    vi.mocked(getEtfMonitorDashboard).mockRejectedValue(new Error("offline"));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("50ETF");
    expect(wrapper.text()).toContain("公开行情缓存暂不可用");
    expect(wrapper.text()).not.toContain("未启用监控");
    wrapper.unmount();
  });

  it("distinguishes a monitored ETF without a quote", async () => {
    const dashboard = { schemaVersion: 1, stateId: null, xqEnabled: false, tradeDate: null,
      etfs: [{ symbol: "SH510050", quote: null }] } as Awaited<ReturnType<typeof getEtfMonitorDashboard>>;
    vi.mocked(getEtfMonitorDashboard).mockResolvedValue(dashboard);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("已监控，暂无有效缓存行情");
    wrapper.unmount();
  });
});
