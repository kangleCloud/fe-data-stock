import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDynamicRoutes, menuComponentPaths, portfolioHomePath } from "@/router/dynamic";
import SnapshotDrawer from "@/components/portfolio/SnapshotDrawer.vue";
import PositionDrawer from "@/components/portfolio/PositionDrawer.vue";
import Positions from "@/views/portfolio/positions/index.vue";
import Dashboard from "@/views/portfolio/dashboard/index.vue";
import { amountInputValid, amountInputValue, currentSnapshotTime, formatMoney, quantityInputValid, signedMoney, snapshotTimeValid } from "@/utils/portfolio";
import type { PortfolioDashboard, PortfolioPosition, PortfolioSnapshot } from "@/types/portfolio";
const mocks = vi.hoisted(() => ({ auth: { permissionCodes: ["**:**:**"] }, page: vi.fn(), list: vi.fn(), get: vi.fn(), analysis: vi.fn(), summary: vi.fn(), dictionary: vi.fn(), save: vi.fn(), audit: vi.fn(), push: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("vue-router", async (original) => ({ ...(await original<typeof import("vue-router")>()), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/api/portfolio", () => ({ positions: { page: mocks.page, list: mocks.list, get: mocks.get }, getPortfolioAnalysis: mocks.analysis, getPortfolioSummary: mocks.summary, getPortfolioDictionary: mocks.dictionary, savePortfolioSnapshot: mocks.save, audits: { list: mocks.audit } }));
const identifier = "9223372036854775807";
const position: PortfolioPosition = { id: identifier, dictionaryId: "9007199254740993", assetType: "STOCK", symbol: "SH600000", nameSnapshot: "测试银行", currentQuantity: 100, totalCost: "1000.00000000", marketValue: "1200.50000000", snapshotAt: "2026-01-01T10:00:00", averageCost: "10.00000000", referencePrice: "12.00500000", unrealizedPnl: "200.50000000", unrealizedRate: "20.05000000", version: 3, snapshotComplete: true };
const snapshot: PortfolioSnapshot = { id: "9007199254740995", positionId: identifier, snapshotAt: "2026-01-01T10:00:00", operationType: "INITIAL", quantity: 100, marketValue: "1200.50000000", totalCost: "1000.00000000", unrealizedPnl: "200.50000000", unrealizedRate: "20.05000000", averageCost: "10.00000000", referencePrice: "12.00500000" };
const summary: PortfolioDashboard = { positionCount: 1, holdingCount: 1, completePositionCount: 1, pendingPositionCount: 0, totalCost: "1000", totalMarketValue: "1200.50", totalUnrealizedPnl: "200.50", categories: [{ assetType: "STOCK", name: "股票", positionCount: 1, holdingCount: 1, completePositionCount: 1, pendingPositionCount: 0, totalCost: "1000", totalMarketValue: "1200.50", totalUnrealizedPnl: "200.50" }], positions: [position] };
const mounted: Array<ReturnType<typeof mount>> = [];
function render(component: Parameters<typeof mount>[0], props: Record<string, unknown> = {}) {
  const wrapper = mount(component, { props, attachTo: document.body, global: { stubs: { BaseChart: { name: "BaseChart", props: ["option"], template: '<div role="img" />' } } } });
  mounted.push(wrapper);
  return wrapper;
}
function button(label: string) { const element = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label); expect(element, label).toBeTruthy(); return element!; }
async function click(label: string) { button(label).click(); await flushPromises(); }
function input(label: string) { const field = [...document.body.querySelectorAll(".el-form-item")].find((item) => item.querySelector("label")?.textContent?.includes(label)); const element = field?.querySelector<HTMLInputElement>("input,textarea"); expect(element, label).toBeTruthy(); return element!; }
async function fill(label: string, value: string) { const element = input(label); element.value = value; element.dispatchEvent(new Event("input", { bubbles: true })); await flushPromises(); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.permissionCodes = ["**:**:**"];
  mocks.page.mockResolvedValue({ list: [position], total: 1 }); mocks.list.mockResolvedValue([]); mocks.get.mockResolvedValue(position); mocks.analysis.mockResolvedValue({ position, snapshots: [snapshot] }); mocks.summary.mockResolvedValue(summary); mocks.dictionary.mockResolvedValue({ list: [{ id: "9007199254740993", assetType: "STOCK", symbol: "SH600000", code: "600000", name: "测试银行", market: "SH" }], total: 1 }); mocks.save.mockResolvedValue("9223372036854775806"); mocks.audit.mockResolvedValue([]);
});
afterEach(() => { mounted.splice(0).forEach((wrapper) => wrapper.unmount()); });
describe("manual snapshot input and routes", () => {
  it("formats decimals without recomputing finance and never rounds history for input", () => {
    expect(formatMoney("99999999999999999999.9995")).toBe("100,000,000,000,000,000,000.000");
    expect(formatMoney("0.00000000")).toBe("0.000"); expect(formatMoney(null)).toBe("—"); expect(signedMoney("1.25")).toBe("+1.250"); expect(signedMoney("-1.25")).toBe("-1.250");
    expect(amountInputValue("1000.12000000")).toBe("1000.12"); expect(amountInputValue("1000.12340000")).toBe("1000.1234");
    expect(amountInputValid("1000.12000000")).toBe(true); expect(amountInputValid("1000.12340000")).toBe(false); expect(amountInputValid("")).toBe(false); expect(amountInputValid("-1")).toBe(false); expect(amountInputValid("1e3")).toBe(false);
    expect(quantityInputValid("0")).toBe(true); expect(quantityInputValid("9007199254740992")).toBe(false); expect(snapshotTimeValid("2099-01-01T10:00:00")).toBe(false); expect(snapshotTimeValid("2026-02-30T10:00:00")).toBe(false); expect(snapshotTimeValid(currentSnapshotTime())).toBe(true);
  });
  it("only registers two portfolio pages and retains the granted dashboard home", () => {
    expect(menuComponentPaths).toContain("portfolio/dashboard/index"); expect(menuComponentPaths).toContain("portfolio/positions/index"); expect(menuComponentPaths).not.toContain("portfolio/trades/index"); expect(menuComponentPaths).not.toContain("portfolio/actions/index");
    const routes = buildDynamicRoutes([{ routeName: "Portfolio", path: "/portfolio", component: "Layout", hidden: false, meta: { menuName: "持仓管理" }, children: ["dashboard", "positions"].map((page) => ({ routeName: "Portfolio" + page, path: page, component: `portfolio/${page}/index`, hidden: false, meta: { menuName: page } })) }]);
    expect(portfolioHomePath(routes, ["portfolio:dashboard:view"])).toBe("/portfolio/dashboard"); expect(portfolioHomePath(routes, ["portfolio:position:view"])).toBe("/portfolio/positions");
  });
  it("searches the dictionary then saves a new INITIAL snapshot in one command", async () => {
    const wrapper = render(SnapshotDrawer, { modelValue: true }); await flushPromises();
    const selector = wrapper.findAllComponents({ name: "ElSelect" }).find((item) => item.props("placeholder") === "输入代码或名称搜索")!;
    await selector.props("remoteMethod")("600000"); await flushPromises();
    const instrument = selector.findAllComponents({ name: "ElOption" })[0]!.props("value");
    selector.vm.$emit("update:modelValue", instrument); selector.vm.$emit("change", instrument); await flushPromises();
    await fill("持仓数量", "100"); await fill("总市值", "1200.50"); await fill("总成本", "1000.00"); await click("保存持仓快照");
    expect(mocks.dictionary).toHaveBeenCalledWith(expect.objectContaining({ assetType: "STOCK", keyword: "600000" }));
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ assetType: "STOCK", dictionaryId: "9007199254740993", operationType: "INITIAL", quantity: 100, marketValue: "1200.5", totalCost: "1000" }));
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("positionId"); expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("price"); expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("actualFee");
    expect(wrapper.emitted("saved")?.[0]).toEqual(["9223372036854775806"]);
  });
  it.each(["BUY", "SELL", "ADJUST"])("records complete %s state without deriving amounts from operation", async (operation) => {
    const wrapper = render(SnapshotDrawer, { modelValue: true, position, operation }); await flushPromises();
    expect(input("总成本").value).toBe("1000"); expect(input("总市值").value).toBe("1200.5");
    await fill("总市值", "1100.00"); await click("保存持仓快照");
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ positionId: identifier, expectedVersion: 3, operationType: operation, totalCost: "1000", marketValue: "1100", quantity: 100 }));
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("dictionaryId"); expect(wrapper.findAllComponents({ name: "ElSelect" })).toHaveLength(1);
  });
  it("requires explicit zeros for closing and reopens the same identity", async () => {
    render(SnapshotDrawer, { modelValue: true, position, operation: "SELL" }); await flushPromises(); await fill("持仓数量", "0"); await click("保存持仓快照"); expect(mocks.save).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("都必须明确填写0");
    await fill("总市值", "0"); await fill("总成本", "0"); await click("保存持仓快照"); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ positionId: identifier, quantity: 0, marketValue: "0", totalCost: "0" }));
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    render(SnapshotDrawer, { modelValue: true, position: { ...position, currentQuantity: 0, totalCost: "0", marketValue: "0" }, operation: "BUY" }); await flushPromises(); await fill("持仓数量", "10"); await fill("总市值", "100"); await fill("总成本", "95"); await click("保存持仓快照"); expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ positionId: identifier, quantity: 10, operationType: "BUY" }));
  });
  it("keeps pending old cost as a reference and rejects missing or high-precision amounts", async () => {
    render(SnapshotDrawer, { modelValue: true, position: { ...position, snapshotComplete: false, totalCost: "1000.12340000", marketValue: null, snapshotAt: null } }); await flushPromises();
    expect(input("总成本").value).toBe("1000.1234"); expect(input("总市值").value).toBe(""); expect(document.body.textContent).toContain("待首次完整录入"); await click("保存持仓快照"); expect(mocks.save).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("最多两位有效小数");
  });
  it("blocks duplicate identity then explicitly maintains the existing holding", async () => {
    mocks.list.mockResolvedValue([position]); const wrapper = render(SnapshotDrawer, { modelValue: true }); await flushPromises();
    const selector = wrapper.findAllComponents({ name: "ElSelect" }).find((item) => item.props("placeholder") === "输入代码或名称搜索")!;
    await selector.props("remoteMethod")("600000"); await flushPromises(); const chosen = selector.findAllComponents({ name: "ElOption" })[0]!.props("value"); selector.vm.$emit("update:modelValue", chosen); selector.vm.$emit("change", chosen); await flushPromises();
    expect(button("保存持仓快照").disabled).toBe(true); await click("维护已有持仓"); await click("保存持仓快照"); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ positionId: identifier, expectedVersion: 3 })); expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("dictionaryId");
  });
  it("requires refreshing a conflicting version and never auto-retries uncertain writes", async () => {
    mocks.save.mockRejectedValueOnce(Object.assign(new Error("版本冲突"), { code: 423 })); render(SnapshotDrawer, { modelValue: true, position }); await flushPromises(); await click("保存持仓快照"); expect(button("保存持仓快照").disabled).toBe(true); await click("刷新当前版本"); expect(mocks.get).toHaveBeenCalledWith(identifier); expect(mocks.save).toHaveBeenCalledTimes(1);
    mocks.save.mockRejectedValueOnce(Object.assign(new Error("请求超时"), { code: 500 })); await click("保存持仓快照"); expect(mocks.save).toHaveBeenCalledTimes(2); expect(button("保存持仓快照").disabled).toBe(true); expect(document.body.textContent).toContain("关闭并核对快照历史");
  });
  it("limits remarks to the same 500-character contract as the server", async () => {
    render(SnapshotDrawer, { modelValue: true, position }); await flushPromises();
    expect(input("备注").maxLength).toBe(500);
    await fill("备注", "备".repeat(501)); await click("保存持仓快照");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("备注最多500字");
    await fill("备注", "备".repeat(500)); await click("保存持仓快照");
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ remark: "备".repeat(500) }));
  });
  it("disables repeated submissions while one save is pending", async () => {
    let resolve!: (id: string) => void; mocks.save.mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; })); render(SnapshotDrawer, { modelValue: true, position }); await flushPromises(); await click("保存持仓快照"); await click("保存持仓快照"); expect(mocks.save).toHaveBeenCalledTimes(1); resolve("9"); await flushPromises();
  });
});
describe("manual portfolio pages and history", () => {
  it("loads the list, formats three places and refreshes after a saved snapshot", async () => {
    const wrapper = render(Positions); await flushPromises(); expect(mocks.page).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10, holdingOnly: true }); expect(wrapper.text()).toContain("1,200.500"); expect(wrapper.text()).toContain("+200.500"); expect(wrapper.text()).not.toContain("核实成本"); expect(wrapper.text()).not.toContain("历史截止日"); expect(wrapper.text()).not.toContain("排序指标"); expect(wrapper.text()).not.toContain("排序方向"); await click("记录买入后持仓"); const drawer = wrapper.findComponent(SnapshotDrawer); expect(drawer.props("operation")).toBe("BUY"); drawer.vm.$emit("saved", "9"); await flushPromises(); expect(mocks.page).toHaveBeenCalledTimes(2);
  });
  it("shows pending first-complete state and never fills absent prices or PnL", async () => {
    const pending = { ...position, snapshotComplete: false, marketValue: null, snapshotAt: null, unrealizedPnl: null, unrealizedRate: null, averageCost: null, referencePrice: null }; mocks.page.mockResolvedValue({ list: [pending], total: 1 }); const wrapper = render(Positions); await flushPromises(); expect(wrapper.text()).toContain("待首次完整录入"); expect(wrapper.text()).not.toContain("+0.000"); expect(wrapper.text()).toContain("—");
  });
  it("only position:update enables maintenance; old trade permissions do not", async () => {
    mocks.auth.permissionCodes = ["portfolio:position:view", "portfolio:trade:add", "portfolio:opening:add"];
    const wrapper = render(Positions); await flushPromises(); expect(wrapper.text()).not.toContain("新增持仓"); expect(wrapper.text()).not.toContain("记录买入后持仓"); await click("查看详情"); expect(document.body.textContent).not.toContain("调整持仓"); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.dictionary).not.toHaveBeenCalled();
  });
  it("keeps server order for same-second snapshots and uses original financial strings in chart", async () => {
    const records = [{ ...snapshot, id: "9223372036854775805", unrealizedPnl: "9999999999999999.1235" }, { ...snapshot, id: "9223372036854775806", operationType: "SELL", quantity: 0, marketValue: "0", totalCost: "0", unrealizedPnl: "0" }, { ...snapshot, id: "9223372036854775807", operationType: "ADJUST", unrealizedPnl: "-1.125" }]; mocks.analysis.mockResolvedValue({ position, snapshots: records }); const wrapper = render(PositionDrawer, { modelValue: true, id: identifier }); await flushPromises(); expect(mocks.analysis).toHaveBeenCalledWith(identifier);
    const option = wrapper.findComponent({ name: "BaseChart" }).props("option"); expect(option.series[0]).toMatchObject({ smooth: false, connectNulls: false, showSymbol: true }); expect(option.series[0].data).toEqual(records.map((item) => Number(item.unrealizedPnl))); expect(option.xAxis.data).toHaveLength(3); expect(option.tooltip.confine).toBe(true); expect(option.tooltip.formatter([{ dataIndex: 0 }])).toContain("+9,999,999,999,999,999.124"); expect(option.tooltip.formatter([{ dataIndex: 1 }])).toContain("持仓数量：0"); expect(option.tooltip.formatter([{ dataIndex: 2 }])).toContain("-1.125"); expect(option.visualMap.pieces).toHaveLength(3); expect(option.series[0].markLine.data).toEqual([{ yAxis: 0 }]); expect(wrapper.text()).toContain("历史只读"); expect(wrapper.text()).not.toContain("更正"); expect(wrapper.text()).not.toContain("作废");
  });
  it("keeps an isolated zero snapshot visible without non-existing price or rate", async () => {
    mocks.analysis.mockResolvedValue({ position: { ...position, currentQuantity: 0, totalCost: "0", marketValue: "0", averageCost: null, referencePrice: null, unrealizedPnl: "0", unrealizedRate: null }, snapshots: [{ ...snapshot, quantity: 0, totalCost: "0", marketValue: "0", unrealizedPnl: "0", unrealizedRate: null }] }); const wrapper = render(PositionDrawer, { modelValue: true, id: identifier }); await flushPromises(); const option = wrapper.findComponent({ name: "BaseChart" }).props("option"); expect(option.series[0].data).toEqual([0]); expect(option.series[0].symbolSize).toBeGreaterThan(0); expect(option.yAxis.min({ min: 0, max: 0 })).toBe(-1); expect(option.yAxis.max({ min: 0, max: 0 })).toBe(1); expect(wrapper.text()).toContain("0.000"); expect(wrapper.text()).toContain("—");
  });
  it("summarizes complete records only and labels the pending count", async () => {
    mocks.summary.mockResolvedValue({ ...summary, positionCount: 2, pendingPositionCount: 1 }); const wrapper = render(Dashboard); await flushPromises(); expect(mocks.summary).toHaveBeenCalledWith(); expect(wrapper.text()).toContain("已完整录入持仓汇总"); expect(wrapper.text()).toContain("待首次完整录入 1"); expect(wrapper.text()).toContain("不代表全部资产总值".replace("不代表", "不是")); expect(wrapper.text()).not.toContain("交易已实现"); expect(wrapper.text()).not.toContain("收益分项"); expect(wrapper.text()).toContain("+200.500");
  });
  it("preserves null aggregate totals when no complete snapshots exist", async () => {
    mocks.summary.mockResolvedValue({ ...summary, completePositionCount: 0, pendingPositionCount: 1, totalCost: null, totalMarketValue: null, totalUnrealizedPnl: null, positions: [{ ...position, snapshotComplete: false, marketValue: null, unrealizedPnl: null }] }); const wrapper = render(Dashboard); await flushPromises(); expect(wrapper.findAll(".portfolio-metric strong").map((item) => item.text())).toEqual(["—", "—", "—"]); expect(wrapper.findAllComponents({ name: "BaseChart" })).toHaveLength(0);
  });
});
