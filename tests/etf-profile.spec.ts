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
  it("displays a readable legacy source in details", async () => {
    vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: "50ETF",
      source: "LEGACY_EXCHANGE", updatedAt: "2026-09-30T10:00:00+08:00" } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
    const wrapper = mountView(); await flushPromises();
    expect(wrapper.text()).toContain("历史交易所资料");
    expect(wrapper.text()).toContain("历史同步");
    expect(wrapper.text()).not.toContain("LEGACY_EXCHANGE");
    expect(wrapper.text()).not.toContain("同花顺同步"); wrapper.unmount();
  });
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

  it("displays THS core fields and established date without old listings or shares", async () => {
    vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: "50ETF", source: "THS",
      fullName: "示例基金全称", fundType: "股票型", investmentType: "被动指数型", fundManager: "示例经理",
      manager: "示例公司", custodian: "示例银行", performanceBenchmark: "示例基准文本",
      establishedDate: "2020-01-02", listingDate: "2020-02-03", shareCount: 100,
      updatedAt: "2026-10-03T10:00:00+08:00" } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
    const wrapper = mountView(); await flushPromises();
    for (const text of ["同花顺同步", "示例基金全称", "股票型", "被动指数型", "示例经理",
      "示例公司", "示例银行", "示例基准文本", "成立日期", "2020-01-02"]) expect(wrapper.text()).toContain(text);
    expect(wrapper.text()).not.toContain("2020-02-03");
    expect(wrapper.text()).not.toContain("基金份额");
    expect(getEtfProfilePage).toHaveBeenCalledWith(expect.objectContaining({ fundType: undefined }));
    expect(getEtfProfilePage).not.toHaveBeenCalledWith(expect.objectContaining({ etfType: expect.anything() }));
    wrapper.unmount();
  });
});
