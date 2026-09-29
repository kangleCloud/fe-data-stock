import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DictionaryPage from "@/views/system/stockDictionary/index.vue";
import MonitorPage from "@/views/system/stockMonitor/index.vue";
import ProfilePage from "@/views/system/stockProfile/index.vue";

const mocks = vi.hoisted(() => ({
  auth: { permissionCodes: [] as string[] },
  monitorPage: vi.fn(), dictionaryPage: vi.fn(), profilePage: vi.fn(),
  dictionaryAdd: vi.fn(),
  enabledList: vi.fn(), refreshStatus: vi.fn(), dictionarySearch: vi.fn(),
  enable: vi.fn(), sort: vi.fn(), refresh: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/api/stockData", () => ({
  getStockMonitorAdminPage: mocks.monitorPage,
  getStockDictionaryAdminPage: mocks.dictionaryPage,
  addStockDictionary: mocks.dictionaryAdd,
  getStockProfileAdminPage: mocks.profilePage,
}));
vi.mock("@/api/market", () => ({
  getStockMonitorConfig: mocks.enabledList,
  getStockMonitorRefreshStatus: mocks.refreshStatus,
  searchStockDictionary: mocks.dictionarySearch,
  setStockEnabled: mocks.enable,
  sortStockMonitor: mocks.sort,
  refreshStockMonitor: mocks.refresh,
}));

const profile = { industry: "银行", listingDate: "1999-11-10", marketCap: 1000000, updatedAt: "2026-09-28T10:00:00+08:00" };
const enabled = [
  { symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH", enabled: true, sortOrder: 1, profile },
  { symbol: "SZ000001", code: "000001", name: "平安银行", market: "SZ", enabled: true, sortOrder: 2, profile },
];

beforeEach(() => {
  mocks.auth.permissionCodes = [];
  mocks.monitorPage.mockResolvedValue({ list: [enabled[0]], total: 2 });
  mocks.dictionaryPage.mockResolvedValue({ list: [enabled[0]], total: 2 });
  mocks.profilePage.mockResolvedValue({ list: [{ ...enabled[0], ...profile }], total: 2 });
  mocks.enabledList.mockResolvedValue(enabled);
  mocks.refreshStatus.mockResolvedValue({ status: "IDLE", message: null });
  mocks.dictionarySearch.mockResolvedValue([]);
  mocks.dictionaryAdd.mockResolvedValue({ symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH" });
  mocks.sort.mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

describe("stock management pages", () => {
  it("loads all monitor states and keeps sorting separate from the filtered page", async () => {
    mocks.auth.permissionCodes = ["system:stock-monitor:view", "system:stock-monitor:update"];
    const wrapper = mount(MonitorPage, { attachTo: document.body });
    await flushPromises();
    expect(mocks.monitorPage).toHaveBeenCalledWith(expect.objectContaining({ pageNum: 1, pageSize: 10, enabled: undefined }));
    expect(wrapper.text()).toContain("已启用 2 / 10 只");
    expect(wrapper.findAll("button").some((button) => button.text().includes("整体刷新"))).toBe(false);

    await wrapper.get('input[placeholder="输入代码或名称"]').setValue("浦发");
    const search = wrapper.findAll("button").find((button) => button.text().includes("查询"));
    await search!.trigger("click");
    await flushPromises();
    expect(mocks.monitorPage).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: "浦发", pageNum: 1 }));

    const sorter = wrapper.findAll("button").find((button) => button.text().includes("调整顺序"));
    await sorter!.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("平安银行");
    const down = document.body.querySelector<HTMLButtonElement>('button[aria-label="下移"]');
    down?.click();
    await flushPromises();
    const save = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("保存完整顺序"));
    save?.click();
    await flushPromises();
    expect(mocks.sort).toHaveBeenCalledWith(["SZ000001", "SH600000"]);
    wrapper.unmount();
  });

  it("keeps dictionary read-only without add permission and profile page read-only", async () => {
    mocks.dictionaryPage.mockResolvedValue({ list: [enabled[0]], total: 25 });
    const dictionary = mount(DictionaryPage, { attachTo: document.body });
    await flushPromises();
    expect(mocks.dictionaryPage).toHaveBeenCalledWith(expect.objectContaining({ pageNum: 1, pageSize: 10 }));
    expect(dictionary.text()).toContain("浦发银行");
    expect(dictionary.text()).not.toContain("启用");
    await dictionary.get('input[placeholder="输入代码或名称"]').setValue("600000");
    await dictionary.findAll("button").find((button) => button.text().includes("查询"))!.trigger("click");
    await flushPromises();
    expect(mocks.dictionaryPage).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: "600000" }));
    await dictionary.get("button.btn-next").trigger("click");
    await flushPromises();
    expect(mocks.dictionaryPage).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2, keyword: "600000" }));
    await dictionary.findAll("button").find((button) => button.text().includes("重置"))!.trigger("click");
    await flushPromises();
    expect(mocks.dictionaryPage).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 1, pageSize: 10, keyword: undefined, market: undefined }));
    dictionary.unmount();

    const profilePage = mount(ProfilePage, { attachTo: document.body });
    await flushPromises();
    expect(profilePage.text()).toContain("MySQL 保存的历史同步资料");
    expect(profilePage.text()).toContain("银行");
    expect(profilePage.text()).not.toContain("启用");
    await profilePage.get('input[placeholder="输入行业"]').setValue("银行");
    await profilePage.findAll("button").find((button) => button.text().includes("查询"))!.trigger("click");
    await flushPromises();
    expect(mocks.profilePage).toHaveBeenLastCalledWith(expect.objectContaining({ industry: "银行" }));
    await profilePage.findAll("button").find((button) => button.text().includes("重置"))!.trigger("click");
    await flushPromises();
    expect(mocks.profilePage).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 1, industry: undefined }));
    profilePage.unmount();
  });

  it("allows only dictionary add permission to open and submit a manual stock", async () => {
    const readOnly = mount(DictionaryPage, { attachTo: document.body });
    await flushPromises();
    expect(readOnly.text()).not.toContain("新增股票");
    readOnly.unmount();

    mocks.auth.permissionCodes = ["system:stock-dictionary:view", "system:stock-dictionary:add"];
    const page = mount(DictionaryPage, { attachTo: document.body });
    await flushPromises();
    await page.findAll("button").find((button) => button.text().includes("新增股票"))!.trigger("click");
    await flushPromises();
    const code = document.body.querySelector<HTMLInputElement>('input[placeholder="例如 600000"]')!;
    const name = document.body.querySelector<HTMLInputElement>('input[placeholder="输入交易所公布的名称"]')!;
    code.value = "600000";
    code.dispatchEvent(new Event("input", { bubbles: true }));
    name.value = "浦发银行";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    const submit = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("确定新增"));
    submit?.click();
    submit?.click();
    await flushPromises();
    expect(mocks.dictionaryAdd).toHaveBeenCalledTimes(1);
    expect(mocks.dictionaryAdd).toHaveBeenCalledWith({ market: "SH", code: "600000", name: "浦发银行" });
    expect(mocks.dictionaryPage).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 1, keyword: "600000", market: "SH" }));
    page.unmount();
  });

  it("keeps the add form open when the server rejects the stock", async () => {
    mocks.auth.permissionCodes = ["system:stock-dictionary:view", "system:stock-dictionary:add"];
    mocks.dictionaryAdd.mockRejectedValue(new Error("股票已存在于字典中"));
    const page = mount(DictionaryPage, { attachTo: document.body });
    await flushPromises();
    await page.findAll("button").find((button) => button.text().includes("新增股票"))!.trigger("click");
    await flushPromises();
    const code = document.body.querySelector<HTMLInputElement>('input[placeholder="例如 600000"]')!;
    const name = document.body.querySelector<HTMLInputElement>('input[placeholder="输入交易所公布的名称"]')!;
    code.value = "600000";
    code.dispatchEvent(new Event("input", { bubbles: true }));
    name.value = "浦发银行";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    const submit = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("确定新增"));
    submit?.click();
    await flushPromises();
    expect(mocks.dictionaryAdd).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("新增字典股票");
    expect(name.value).toBe("浦发银行");
    page.unmount();
  });
});
