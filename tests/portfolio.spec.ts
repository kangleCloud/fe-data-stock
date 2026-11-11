import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDynamicRoutes, menuComponentPaths, portfolioHomePath } from "@/router/dynamic";
import DailyEntryDrawer from "@/components/portfolio/DailyEntryDrawer.vue";
import PositionDetailDrawer from "@/components/portfolio/PositionDetailDrawer.vue";
import Positions from "@/views/portfolio/positions/index.vue";
import Dashboard from "@/views/portfolio/dashboard/index.vue";
import {
  amountInputValid,
  amountInputValue,
  currentTradeDate,
  formatMoney,
  formatTradeDate,
  quantityInputValid,
  signedMoney,
  tradeDateValid,
} from "@/utils/portfolio";
import type { PortfolioDaily, PortfolioDashboard, PortfolioPosition } from "@/types/portfolio";

const mocks = vi.hoisted(() => ({
  auth: { permissionCodes: ["**:**:**"] },
  page: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  summary: vi.fn(),
  dictionary: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("vue-router", async (original) => ({
  ...(await original<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/api/portfolio", () => ({
  positions: { page: mocks.page, list: mocks.list },
  getPortfolioPositionDetail: mocks.detail,
  getPortfolioSummary: mocks.summary,
  getPortfolioDictionary: mocks.dictionary,
  savePortfolioDaily: mocks.save,
  audits: { list: mocks.audit },
}));

const identifier = "9223372036854775807";
const position: PortfolioPosition = {
  id: identifier,
  dictionaryId: "9007199254740993",
  assetType: "STOCK",
  symbol: "SH600000",
  nameSnapshot: "测试银行",
  quantity: 100,
  totalCost: "1000.00000000",
  marketValue: "1200.50000000",
  tradeDate: "2026-01-05",
  averageCost: "10.00000000",
  referencePrice: "12.00500000",
  unrealizedPnl: "200.50000000",
  unrealizedRate: "20.05000000",
};
const daily: PortfolioDaily = {
  id: "9007199254740995",
  positionId: identifier,
  tradeDate: "2026-01-05",
  quantity: 100,
  marketValue: "1200.50000000",
  totalCost: "1000.00000000",
  averageCost: "10.00000000",
  referencePrice: "12.00500000",
  unrealizedPnl: "200.50000000",
  unrealizedRate: "20.05000000",
};
const summary: PortfolioDashboard = {
  positionCount: 1,
  holdingCount: 1,
  totalCost: "1000",
  totalMarketValue: "1200.50",
  totalUnrealizedPnl: "200.50",
  categories: [{
    assetType: "STOCK",
    name: "股票",
    positionCount: 1,
    holdingCount: 1,
    totalCost: "1000",
    totalMarketValue: "1200.50",
    totalUnrealizedPnl: "200.50",
  }],
  positions: [position],
};
const mounted: Array<ReturnType<typeof mount>> = [];

function render(component: Parameters<typeof mount>[0], props: Record<string, unknown> = {}) {
  const wrapper = mount(component, {
    props,
    attachTo: document.body,
    global: {
      stubs: {
        BaseChart: { name: "BaseChart", props: ["option"], template: '<div role="img" />' },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

function button(label: string) {
  const element = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === label);
  expect(element, label).toBeTruthy();
  return element!;
}

async function click(label: string) {
  button(label).click();
  await flushPromises();
}

function input(label: string) {
  const field = [...document.body.querySelectorAll(".el-form-item")]
    .find((item) => item.querySelector("label")?.textContent?.includes(label));
  const element = field?.querySelector<HTMLInputElement>("input,textarea");
  expect(element, label).toBeTruthy();
  return element!;
}

async function fill(label: string, value: string) {
  const element = input(label);
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
}

async function setDate(wrapper: ReturnType<typeof mount>, value: string) {
  const picker = wrapper.findComponent({ name: "ElDatePicker" });
  expect(picker.exists()).toBe(true);
  picker.vm.$emit("update:modelValue", value);
  picker.vm.$emit("change", value);
  await flushPromises();
}

async function selectInstrument(wrapper: ReturnType<typeof mount>, keyword = "600000") {
  const selector = wrapper.findAllComponents({ name: "ElSelect" })
    .find((item) => item.props("placeholder") === "输入代码或名称搜索");
  expect(selector).toBeTruthy();
  await selector!.props("remoteMethod")(keyword);
  await flushPromises();
  const chosen = selector!.findAllComponents({ name: "ElOption" })[0]!.props("value");
  selector!.vm.$emit("update:modelValue", chosen);
  selector!.vm.$emit("change", chosen);
  await flushPromises();
}

async function setEntryMode(wrapper: ReturnType<typeof mount>, mode: "marketValue" | "pnl") {
  const group = wrapper.findComponent({ name: "ElRadioGroup" });
  expect(group.exists()).toBe(true);
  group.vm.$emit("update:modelValue", mode);
  group.vm.$emit("change", mode);
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.permissionCodes = ["**:**:**"];
  mocks.page.mockResolvedValue({ list: [position], total: 1 });
  mocks.list.mockResolvedValue([]);
  mocks.detail.mockResolvedValue({ position, records: [daily] });
  mocks.summary.mockResolvedValue(summary);
  mocks.dictionary.mockResolvedValue({
    list: [{ id: "9007199254740993", assetType: "STOCK", symbol: "SH600000", code: "600000", name: "测试银行", market: "SH" }],
    total: 1,
  });
  mocks.save.mockResolvedValue(identifier);
  mocks.audit.mockResolvedValue([]);
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("daily entry and calculation", () => {
  it("formats decimals and dates without recomputing finance", () => {
    expect(formatMoney("99999999999999999999.9995")).toBe("100,000,000,000,000,000,000.000");
    expect(formatMoney("0.00000000")).toBe("0.000");
    expect(formatMoney(null)).toBe("—");
    expect(signedMoney("1.25")).toBe("+1.250");
    expect(signedMoney("-1.25")).toBe("-1.250");
    expect(amountInputValue("1000.12000000")).toBe("1000.12");
    expect(amountInputValue("1000.12340000")).toBe("1000.1234");
    expect(amountInputValid("1000.12000000")).toBe(true);
    expect(amountInputValid("1000.12340000")).toBe(false);
    expect(amountInputValid("")).toBe(false);
    expect(amountInputValid("-1")).toBe(false);
    expect(quantityInputValid("0")).toBe(true);
    expect(quantityInputValid("9007199254740992")).toBe(false);
    expect(formatTradeDate("2026-01-05")).toBe("2026-01-05");
    expect(formatTradeDate(null)).toBe("—");
    expect(tradeDateValid("2099-01-01")).toBe(false);
    expect(tradeDateValid("2026-02-30")).toBe(false);
    expect(tradeDateValid(currentTradeDate())).toBe(true);
  });

  it("only registers two portfolio pages and retains the granted dashboard home", () => {
    expect(menuComponentPaths).toContain("portfolio/dashboard/index");
    expect(menuComponentPaths).toContain("portfolio/positions/index");
    expect(menuComponentPaths).not.toContain("portfolio/trades/index");
    expect(menuComponentPaths).not.toContain("portfolio/actions/index");
    const routes = buildDynamicRoutes([{
      routeName: "Portfolio",
      path: "/portfolio",
      component: "Layout",
      hidden: false,
      meta: { menuName: "持仓管理" },
      children: ["dashboard", "positions"].map((page) => ({
        routeName: "Portfolio" + page,
        path: page,
        component: `portfolio/${page}/index`,
        hidden: false,
        meta: { menuName: page },
      })),
    }]);
    expect(portfolioHomePath(routes, ["portfolio:dashboard:view"])).toBe("/portfolio/dashboard");
    expect(portfolioHomePath(routes, ["portfolio:position:view"])).toBe("/portfolio/positions");
  });

  it("saves a new instrument as one daily record without duplicate precheck", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true });
    await flushPromises();
    await selectInstrument(wrapper);
    await fill("持仓数量", "100");
    await fill("总市值", "1200.50");
    await fill("总成本", "1000.00");
    await click("保存记录");

    expect(mocks.dictionary).toHaveBeenCalledWith(expect.objectContaining({ assetType: "STOCK", keyword: "600000" }));
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      assetType: "STOCK",
      dictionaryId: "9007199254740993",
      tradeDate: currentTradeDate(),
      quantity: 100,
      marketValue: "1200.5",
      totalCost: "1000",
    }));
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("positionId");
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("operationType");
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("expectedVersion");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(wrapper.emitted("saved")?.[0]).toEqual([identifier]);
  });

  it("prefills the latest values for an existing position and saves only the position ID", async () => {
    render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    expect(input("持仓数量").value).toBe("100");
    expect(input("总成本").value).toBe("1000");
    expect(input("总市值").value).toBe("1200.5");
    await fill("总市值", "1100.00");
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      positionId: identifier,
      tradeDate: currentTradeDate(),
      quantity: 100,
      totalCost: "1000",
      marketValue: "1100",
    }));
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("dictionaryId");
  });

  it("derives total cost from market value and PnL without floating point", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true });
    await flushPromises();
    await selectInstrument(wrapper);
    await setEntryMode(wrapper, "pnl");
    await fill("持仓数量", "900");
    await fill("总市值", "9864.00");
    await fill("浮动盈亏", "-2368.61");
    expect(input("总成本（自动计算）").value).toBe("12232.61");
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      assetType: "STOCK",
      dictionaryId: "9007199254740993",
      tradeDate: currentTradeDate(),
      quantity: 900,
      marketValue: "9864",
      totalCost: "12232.61",
    }));
    expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("unrealizedPnl");
  });

  it("rejects a gain that makes total cost negative", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await setEntryMode(wrapper, "pnl");
    await fill("总市值", "100");
    await fill("浮动盈亏", "100.01");
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("总成本不能为负");
  });

  it("rejects PnL with more than two decimals", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await setEntryMode(wrapper, "pnl");
    await fill("浮动盈亏", "1.234");
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("浮动盈亏必须为金额，最多两位有效小数");
  });

  it("keeps amounts consistent when switching entry modes", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await setEntryMode(wrapper, "pnl");
    expect(input("浮动盈亏").value).toBe("200.5");
    await fill("浮动盈亏", "300");
    await setEntryMode(wrapper, "marketValue");
    expect(input("总成本").value).toBe("900.5");
    expect(input("总市值").value).toBe("1200.5");
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      positionId: identifier,
      marketValue: "1200.5",
      totalCost: "900.5",
    }));
  });

  it("derives total cost from the latest market value and PnL", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await setEntryMode(wrapper, "pnl");
    await fill("浮动盈亏", "-100");
    expect(input("总成本（自动计算）").value).toBe("1300.50");
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      positionId: identifier,
      marketValue: "1200.5",
      totalCost: "1300.5",
    }));
  });

  it("rejects a computed total cost outside the amount range", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await setEntryMode(wrapper, "pnl");
    await fill("总市值", "99999999999999999999.99");
    await fill("浮动盈亏", "-99999999999999999999.99");
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("总成本超出金额范围");
  });

  it("recomputes PnL when switching record dates", async () => {
    const today = currentTradeDate();
    mocks.detail.mockResolvedValue({
      position,
      records: [
        { ...daily, id: "2", tradeDate: "2026-01-05", quantity: 100, totalCost: "1000.00", marketValue: "1200.50" },
        { ...daily, id: "3", tradeDate: today, quantity: 200, totalCost: "2000.00", marketValue: "2400.00" },
      ],
    });
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await setEntryMode(wrapper, "pnl");
    expect(input("浮动盈亏").value).toBe("400");
    expect(input("总成本（自动计算）").value).toBe("2000.00");
    await setDate(wrapper, "2026-01-05");
    expect(input("浮动盈亏").value).toBe("200.5");
    expect(input("总成本（自动计算）").value).toBe("1000.00");
  });

  it("shows an overwrite notice and uses the existing same-day record", async () => {
    const today = currentTradeDate();
    mocks.detail.mockResolvedValue({
      position,
      records: [{ ...daily, tradeDate: today, quantity: 200, totalCost: "2000.00", marketValue: "2400.00", unrealizedPnl: "400.00" }],
    });
    render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    expect(document.body.textContent).toContain("该日期已有记录，保存将覆盖当日数据");
    expect(input("持仓数量").value).toBe("200");
    expect(input("总成本").value).toBe("2000");
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      positionId: identifier,
      tradeDate: today,
      quantity: 200,
      totalCost: "2000",
      marketValue: "2400",
    }));
  });

  it("switches to the selected date record and falls back to the latest values", async () => {
    const today = currentTradeDate();
    mocks.detail.mockResolvedValue({
      position,
      records: [
        { ...daily, id: "2", tradeDate: "2026-01-05", quantity: 100, totalCost: "1000.00", marketValue: "1200.50" },
        { ...daily, id: "3", tradeDate: today, quantity: 200, totalCost: "2000.00", marketValue: "2400.00" },
      ],
    });
    const wrapper = render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    expect(input("持仓数量").value).toBe("200");
    await setDate(wrapper, "2026-01-05");
    expect(input("持仓数量").value).toBe("100");
    await setDate(wrapper, "2026-01-04");
    expect(input("持仓数量").value).toBe("100");
  });

  it("shows the closing hint and saves zero values", async () => {
    render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await fill("持仓数量", "0");
    expect(document.body.textContent).toContain("数量为0时按清仓记录");
    await fill("总市值", "0");
    await fill("总成本", "0");
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      positionId: identifier,
      quantity: 0,
      marketValue: "0",
      totalCost: "0",
    }));
  });

  it("blocks missing instrument, high-precision amounts and future dates", async () => {
    const wrapper = render(DailyEntryDrawer, { modelValue: true });
    await flushPromises();
    await fill("持仓数量", "100");
    await fill("总市值", "1200");
    await fill("总成本", "1000");
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("请选择标的");

    await selectInstrument(wrapper);
    await fill("总市值", "1.234");
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("最多两位有效小数");

    await fill("总市值", "1.23");
    await setDate(wrapper, "2099-01-01");
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("不晚于今天");
  });

  it("limits remarks to the same 500-character contract as the server", async () => {
    render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    expect(input("备注").maxLength).toBe(500);
    await fill("备注", "备".repeat(501));
    await click("保存记录");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("备注最多500字");
    await fill("备注", "备".repeat(500));
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ remark: "备".repeat(500) }));
  });

  it("keeps the form retryable after a failed save", async () => {
    mocks.save.mockRejectedValueOnce(new Error("网络错误"));
    render(DailyEntryDrawer, { modelValue: true, position });
    await flushPromises();
    await click("保存记录");
    expect(document.body.textContent).toContain("网络错误");
    expect(button("保存记录").disabled).toBe(false);
    await click("保存记录");
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
});

describe("daily portfolio pages and history", () => {
  it("loads the list, records today and opens the detail", async () => {
    const wrapper = render(Positions);
    await flushPromises();
    expect(mocks.page).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10, holdingOnly: true });
    expect(wrapper.text()).toContain("1,200.500");
    expect(wrapper.text()).toContain("+200.500");
    expect(wrapper.text()).toContain("2026-01-05");

    await click("记录");
    const entry = wrapper.findComponent(DailyEntryDrawer);
    expect(entry.props("position")).toMatchObject({ id: identifier });
    entry.vm.$emit("saved", "9");
    await flushPromises();
    expect(mocks.page).toHaveBeenCalledTimes(2);

    await click("查看详情");
    expect(wrapper.findComponent(PositionDetailDrawer).props("id")).toBe(identifier);
  });

  it("renders the detail chart, table and audit tab", async () => {
    const records = [
      daily,
      { ...daily, id: "6", tradeDate: "2026-01-06", quantity: 0, marketValue: "0", totalCost: "0", unrealizedPnl: "-1.125", unrealizedRate: null, averageCost: null, referencePrice: null },
    ];
    mocks.detail.mockResolvedValue({ position, records });
    mocks.audit.mockResolvedValue([{
      id: "1",
      operation: "SAVE",
      targetType: "POSITION_DAILY",
      targetId: "2",
      operationReason: "备注",
      beforeData: "{}",
      afterData: "{}",
    }]);
    const wrapper = render(PositionDetailDrawer, { modelValue: true, id: identifier });
    await flushPromises();
    expect(mocks.detail).toHaveBeenCalledWith(identifier);
    const option = wrapper.findComponent({ name: "BaseChart" }).props("option");
    expect(option.xAxis.data).toEqual(["2026-01-05", "2026-01-06"]);
    expect(option.series[0].data).toEqual([200.5, -1.125]);
    expect(wrapper.text()).toContain("历史只读");
    expect(mocks.audit).toHaveBeenCalledWith({ positionId: identifier });

    const auditTab = [...document.body.querySelectorAll(".el-tabs__item")]
      .find((item) => item.textContent?.includes("操作审计"));
    auditTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).toContain("保存");
  });

  it("summarizes all latest records without pending counters", async () => {
    const wrapper = render(Dashboard);
    await flushPromises();
    expect(mocks.summary).toHaveBeenCalledWith();
    expect(wrapper.text()).toContain("最新收盘汇总");
    expect(wrapper.text()).toContain("全部标的 1");
    expect(wrapper.text()).toContain("+200.500");
    expect(wrapper.text()).not.toContain("待首次完整录入");
  });

  it("shows zero totals and no charts for an empty portfolio", async () => {
    mocks.summary.mockResolvedValue({
      ...summary,
      positionCount: 0,
      holdingCount: 0,
      totalCost: "0",
      totalMarketValue: "0",
      totalUnrealizedPnl: "0",
      positions: [],
      categories: summary.categories.map((item) => ({
        ...item,
        positionCount: 0,
        holdingCount: 0,
        totalCost: "0",
        totalMarketValue: "0",
        totalUnrealizedPnl: "0",
      })),
    });
    const wrapper = render(Dashboard);
    await flushPromises();
    expect(wrapper.text()).toContain("尚无持仓");
    expect(wrapper.findAll(".portfolio-metric strong").map((item) => item.text()))
      .toEqual(["0.000", "0.000", "0.000"]);
    expect(wrapper.findAllComponents({ name: "BaseChart" })).toHaveLength(0);
  });

  it("only position:view keeps the pages readonly", async () => {
    mocks.auth.permissionCodes = ["portfolio:position:view"];
    const wrapper = render(Positions);
    await flushPromises();
    expect(wrapper.text()).not.toContain("新增标的");
    expect([...document.body.querySelectorAll("button")].some((item) => item.textContent?.trim() === "记录")).toBe(false);
    await click("查看详情");
    expect(document.body.textContent).not.toContain("记录持仓");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
