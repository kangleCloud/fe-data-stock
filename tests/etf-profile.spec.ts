import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEtfMonitorDashboard, getEtfProfileDetail, getEtfProfilePage, refreshEtfAllocation } from "@/api/etf";
import ProfileView from "@/views/system/etfProfile/index.vue";
import { ApiError } from "@/utils/request";

const route = reactive({ query: { symbol: "SH510050" } });
const auth = reactive({ isAuthenticated: true, permissionCodes: [] as string[] });
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("vue-router", () => ({ useRoute: () => route }));
vi.mock("@/api/etf", () => ({ getEtfMonitorDashboard: vi.fn(), getEtfProfileDetail: vi.fn(), getEtfProfilePage: vi.fn(), refreshEtfAllocation: vi.fn() }));

function mountView() {
  return shallowMount(ProfileView, { global: { renderStubDefaultSlot: true,
    stubs: { RouterLink: true, ElTableColumn: { template: "<span />" } },
    directives: { loading: () => {} } } });
}

beforeEach(() => {
  vi.resetAllMocks();
  route.query.symbol = "SH510050";
  auth.isAuthenticated = true; auth.permissionCodes = [];
  vi.mocked(getEtfProfilePage).mockResolvedValue({ list: [], total: 0 });
  vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: "50ETF" } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
  vi.mocked(getEtfMonitorDashboard).mockResolvedValue({ schemaVersion: 1, stateId: null, xqEnabled: false, tradeDate: null, etfs: [] });
});

describe("ETF profile cached quote", () => {
  it("renders fund profile fields and failure messages as literal text", async () => {
    const text = '<img src=x onerror="alert(1)">基金 & "经理" <测试>';
    vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: text,
      fullName: text, fundManager: text, performanceBenchmark: text } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
    const wrapper = mountView();
    try {
      await flushPromises(); expect(wrapper.get("h2").text()).toContain(text);
      expect(wrapper.get(".etf-detail dl").text()).toContain(text);
      expect(wrapper.findAll("script,img[onerror],[onerror],svg[onload]")).toHaveLength(0);
    } finally { wrapper.unmount(); }
    vi.mocked(getEtfProfileDetail).mockRejectedValue(new Error(text));
    const failed = mountView();
    try {
      await flushPromises(); expect(failed.get('[role="alert"]').text()).toBe(text);
      expect(failed.findAll("script,img[onerror],[onerror],svg[onload]")).toHaveLength(0);
    } finally { failed.unmount(); }
  });
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

describe("ETF asset allocation synchronization", () => {
  const report = { source: "XQ_DANJUAN", requestedReportPeriod: "2026-06-30", collectedAt: "2026-10-09T10:00:00+08:00",
    categories: [{ category: "股票", percent: 90 }] };

  function allowSync(xqEnabled = true, enabled = true): void {
    auth.permissionCodes = ["system:etf-monitor:refresh"];
    vi.mocked(getEtfMonitorDashboard).mockResolvedValue({ schemaVersion: 1, stateId: "a", xqEnabled,
      tradeDate: null, etfs: enabled ? [{ symbol: "SH510050", quote: null }] : [] } as Awaited<ReturnType<typeof getEtfMonitorDashboard>>);
    vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: "50ETF",
      assetAllocation: report } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
  }

  async function selectDate(wrapper: ReturnType<typeof mountView>, period = "20260630"): Promise<void> {
    wrapper.findComponent({ name: "ElDatePicker" }).vm.$emit("update:modelValue", period);
    await flushPromises();
  }

  it("hides synchronization without permission, including stale permissions for an unauthenticated user", async () => {
    let wrapper = mountView(); await flushPromises();
    expect(wrapper.find(".allocation-sync-form").exists()).toBe(false); wrapper.unmount();
    allowSync(); auth.isAuthenticated = false;
    wrapper = mountView(); await flushPromises();
    expect(wrapper.find(".allocation-sync-form").exists()).toBe(false);
    expect(refreshEtfAllocation).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it.each([[false, true, "总闸已关闭"], [true, false, "未启用监控"]] as const)("disables actions when xq=%s enabled=%s and keeps historical report", async (xq, enabled, reason) => {
    allowSync(xq, enabled); const wrapper = mountView();
    try {
      await flushPromises(); expect(wrapper.text()).toContain(reason);
      expect(wrapper.text()).toContain("2026-06-30");
      expect(wrapper.get(".allocation-sync-form el-button-stub").attributes("disabled")).toBeDefined();
      await wrapper.get(".allocation-sync-form").trigger("submit");
      expect(refreshEtfAllocation).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it("keeps synchronization disabled when the cache cannot confirm the gate", async () => {
    allowSync(); vi.mocked(getEtfMonitorDashboard).mockRejectedValue(new Error("offline"));
    const wrapper = mountView();
    try { await flushPromises(); expect(wrapper.text()).toContain("无法确认采集总闸");
      await wrapper.get(".allocation-sync-form").trigger("submit"); expect(refreshEtfAllocation).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it("requires an actual calendar date without defaulting or scanning periods", async () => {
    allowSync(); const wrapper = mountView();
    try {
      await flushPromises(); expect(wrapper.findComponent({ name: "ElDatePicker" }).props("modelValue")).toBe("");
      await wrapper.get(".allocation-sync-form").trigger("submit"); expect(wrapper.text()).toContain("请选择有效");
      await selectDate(wrapper, "20260230"); await wrapper.get(".allocation-sync-form").trigger("submit");
      expect(refreshEtfAllocation).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it("submits one period once, prevents duplicates, and rereads the detail on success", async () => {
    allowSync(); let resolve!: (value: Awaited<ReturnType<typeof refreshEtfAllocation>>) => void;
    vi.mocked(refreshEtfAllocation).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const wrapper = mountView();
    try {
      await flushPromises(); await selectDate(wrapper);
      await wrapper.get(".allocation-sync-form").trigger("submit");
      await wrapper.get(".allocation-sync-form").trigger("submit");
      expect(refreshEtfAllocation).toHaveBeenCalledExactlyOnceWith("SH510050", "20260630");
      expect(wrapper.get(".allocation-sync-form el-button-stub").attributes("disabled")).toBeDefined();
      vi.mocked(getEtfProfileDetail).mockResolvedValue({ symbol: "SH510050", name: "50ETF",
        assetAllocation: { ...report, collectedAt: "2026-10-09T11:00:00+08:00" } } as Awaited<ReturnType<typeof getEtfProfileDetail>>);
      resolve({ status: "SUCCESS", startedAt: null, finishedAt: null, message: null }); await flushPromises();
      expect(getEtfProfileDetail).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain("同步成功"); expect(wrapper.text()).toContain("11:00");
      expect(getEtfMonitorDashboard).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it.each([[409, "该报告期无源数据"], [429, "资源不足"], [503, "总闸已关闭"], [423, "同步正在执行"]])("retains the detail on %s and displays the cause", async (code, message) => {
    allowSync(); vi.mocked(refreshEtfAllocation).mockRejectedValue(new ApiError(String(message), Number(code)));
    const wrapper = mountView();
    try {
      await flushPromises(); await selectDate(wrapper); await wrapper.get(".allocation-sync-form").trigger("submit"); await flushPromises();
      expect(wrapper.text()).toContain(String(message)); expect(wrapper.text()).toContain(`（${code}）`);
      expect(wrapper.text()).toContain("2026-06-30"); expect(getEtfProfileDetail).toHaveBeenCalledTimes(1);
      expect(refreshEtfAllocation).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it("does not retry an unconfirmed timeout or erase the existing report", async () => {
    allowSync(); vi.mocked(refreshEtfAllocation).mockRejectedValue(new ApiError("同步请求超时，结果未确认；未自动重试"));
    const wrapper = mountView();
    try {
      await flushPromises(); await selectDate(wrapper); await wrapper.get(".allocation-sync-form").trigger("submit"); await flushPromises();
      expect(wrapper.text()).toContain("结果未确认"); expect(wrapper.text()).toContain("2026-06-30");
      expect(refreshEtfAllocation).toHaveBeenCalledTimes(1); expect(getEtfProfileDetail).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it("keeps the previous report if a successful synchronization cannot reread the detail", async () => {
    allowSync(); vi.mocked(refreshEtfAllocation).mockResolvedValue({ status: "SUCCESS", startedAt: null, finishedAt: null, message: null });
    const wrapper = mountView();
    try {
      await flushPromises(); vi.mocked(getEtfProfileDetail).mockRejectedValue(new Error("缓存读取失败"));
      await selectDate(wrapper); await wrapper.get(".allocation-sync-form").trigger("submit"); await flushPromises();
      expect(wrapper.text()).toContain("同步已成功，但详情重新读取失败"); expect(wrapper.text()).toContain("2026-06-30");
      expect(refreshEtfAllocation).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });
});
