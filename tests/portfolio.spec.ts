import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDynamicRoutes,
  portfolioHomePath,
  menuComponentPaths,
} from "@/router/dynamic";
import {
  cutoffForDate,
  decimalValid,
  formatMoney,
  formatChartTick,
  priceInputValid,
  integerValid,
  localDate,
  usePortfolioCommand,
  writeErrorText,
} from "@/utils/portfolio";
import Dashboard from "@/views/portfolio/dashboard/index.vue";
import Positions from "@/views/portfolio/positions/index.vue";
import Trades from "@/views/portfolio/trades/index.vue";
import Actions from "@/views/portfolio/actions/index.vue";
import TradeDrawer from "@/components/portfolio/TradeDrawer.vue";
import ActionDrawer from "@/components/portfolio/ActionDrawer.vue";
import BrokerReferenceDetails from "@/components/portfolio/BrokerReferenceDetails.vue";
import PositionDrawer from "@/components/portfolio/PositionDrawer.vue";
import type {
  PortfolioDashboard,
  PortfolioPosition,
  PortfolioTrade,
  BrokerReference,
} from "@/types/portfolio";
const m = vi.hoisted(() => ({
  auth: { permissionCodes: ["**:**:**"] },
  page: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  summary: vi.fn(),
  history: vi.fn(),
  analysis: vi.fn(),
  dictionary: vi.fn(),
  contexts: vi.fn(),
  context: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  void: vi.fn(),
  valuationList: vi.fn(),
  auditList: vi.fn(),
  router: {
    push: vi.fn(),
    hasRoute: vi.fn(() => true),
    resolve: vi.fn(() => ({ name: "PortfolioPositions" })),
  },
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => m.auth }));
vi.mock("vue-router", async (original) => ({
  ...(await original<typeof import("vue-router")>()),
  useRouter: () => m.router,
}));
vi.mock("@/api/portfolio", () => ({
  positions: { page: m.page, list: m.list, get: m.get, history: m.history },
  trades: {
    page: m.page,
    list: m.list,
    get: m.get,
    preview: m.preview,
    create: m.create,
    replace: m.replace,
    void: m.void,
  },
  actions: {
    page: m.page,
    list: m.list,
    get: m.get,
    preview: m.preview,
    create: m.create,
    replace: m.replace,
    void: m.void,
  },
  valuations: {
    list: m.valuationList,
    create: m.create,
    replace: m.replace,
    void: m.void,
  },
  audits: { list: m.auditList },
  getPortfolioContexts: m.contexts,
  getPortfolioContext: m.context,
  getPortfolioSummary: m.summary,
  getPortfolioAnalysis: m.analysis,
  getPortfolioDictionary: m.dictionary,
  previewTradeReplacement: m.preview,
  previewActionReplacement: m.preview,
}));
const position = {
  id: 1,
  assetType: "STOCK",
  dictionaryId: 2,
  symbol: "SH600000",
  nameSnapshot: "测试银行",
  currentQuantity: 100,
  remainingCost: "1000.00000000",
  realizedPnl: "394.00",
  actionCashIncome: "0.00",
  costStatus: "VERIFIED",
  pnlStatus: "CONFIRMED",
  pendingActionCount: 0,
  currentCycleStartTradeId: 1,
  version: 3,
  averageCost: "10.00000000",
  valuationPrice: null,
  marketValue: null,
  unrealizedPnl: null,
  totalPnl: null,
  valuationStatus: "MISSING",
} as PortfolioPosition;
const summary = {
  asOf: "2026-10-15T10:00:00",
  status: "INCOMPLETE",
  message: "部分持仓缺少估值",
  positionCount: 2,
  holdingCount: 2,
  valuedHoldingCount: 1,
  reliableHoldingCount: 2,
  coveredHoldingCount: 1,
  totalCost: "2000",
  partialCost: "2000",
  totalRealizedPnl: "394",
  partialRealizedPnl: "394",
  actionCashIncome: "0",
  partialMarketValue: "1234.50",
  partialUnrealizedPnl: "234.50",
  totalMarketValue: null,
  totalUnrealizedPnl: null,
  totalPnl: null,
  valuationCoverageRate: "50.00",
  categories: [],
  costAllocation: [],
  incomeItems: [
    {
      type: "UNREALIZED",
      name: "浮动盈亏",
      amount: null,
      partialAmount: "234.50",
      status: "INCOMPLETE",
    },
  ],
  recentTrades: [],
} as PortfolioDashboard;
const mounted: Array<ReturnType<typeof mount>> = [];
function render(
  component: Parameters<typeof mount>[0],
  props: Record<string, unknown> = {},
) {
  const w = mount(component, {
    props,
    attachTo: document.body,
    global: {
      stubs: {
        BaseChart: {
          name: "BaseChart",
          props: ["option"],
          template: '<div role="img" aria-label="测试图表" />',
        },
      },
    },
  });
  mounted.push(w);
  return w;
}
function button(text: string) {
  const found = [
    ...document.body.querySelectorAll<HTMLButtonElement>("button"),
  ].find((x) => x.textContent?.trim() === text);
  expect(found, `button ${text}`).toBeTruthy();
  return found!;
}
async function click(text: string) {
  button(text).click();
  await flushPromises();
}
function input(label: string) {
  const item = [...document.body.querySelectorAll(".el-form-item")].find((x) =>
    x.querySelector("label")?.textContent?.includes(label),
  );
  const input = item?.querySelector<HTMLInputElement>("input,textarea");
  expect(input, `input ${label}`).toBeTruthy();
  return input!;
}
async function fill(label: string, value: string) {
  const el = input(label);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
}
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.permissionCodes = ["**:**:**"];
  m.page.mockResolvedValue({ list: [], total: 0 });
  m.list.mockResolvedValue([position]);
  m.get.mockResolvedValue(position);
  m.context.mockResolvedValue(position);
  m.contexts.mockResolvedValue({ list: [position], total: 1 });
  m.summary.mockResolvedValue(summary);
  m.history.mockResolvedValue({ ...position, currentQuantity: 50 });
  m.analysis.mockResolvedValue({ position, costEntries: [] });
  m.dictionary.mockResolvedValue({ list: [], total: 0 });
  m.preview.mockResolvedValue({
    canSave: true,
    message: "可保存",
    before: position,
    after: position,
    trade: {
      actualFee: "0",
      grossAmount: "1000.00",
      allocatedCost: "1000",
      basePnl: "1188",
      pnlAdjustment: "0",
      finalPnl: "1188",
    },
    suggestedGrossAmount: "1000.00",
  });
  m.create.mockResolvedValue(9);
  m.replace.mockResolvedValue(10);
  m.valuationList.mockResolvedValue([]);
  m.auditList.mockResolvedValue([]);
});
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
});
describe("portfolio decimal and command boundary", () => {
  it("formats huge decimals without floating point loss and HALF_UP at display only", () => {
    expect(formatMoney("99999999999999999999.9995")).toBe(
      "100,000,000,000,000,000,000.000",
    );
    expect(formatMoney("-1.0055")).toBe("-1.006");
    expect(formatMoney("-0.0004")).toBe("0.000");
    expect(formatMoney("3")).toBe("3.000");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney("0.00000001")).toBe("0.000");
    expect(formatMoney("12.3456")).toBe("12.346");
    expect(formatChartTick(0)).toBe("0.000");
  });
  it("rejects exponential strings, excessive precision, unsafe integer and blank fee", () => {
    expect(decimalValid("1e3")).toBe(false);
    expect(decimalValid("1.001")).toBe(false);
    expect(decimalValid("0")).toBe(true);
    expect(decimalValid("")).toBe(false);
    expect(integerValid("9007199254740992")).toBe(false);
  });
  it("validates effective three-place price precision while preserving unchanged historical facts", () => {
    expect(priceInputValid("6.11300000")).toBe(true);
    expect(priceInputValid("6.1131")).toBe(false);
    expect(priceInputValid("10.12345678", "10.12345678")).toBe(true);
    expect(priceInputValid("010.1234000", "10.12340000")).toBe(true);
    expect(priceInputValid("10.12345679", "10.12345678")).toBe(false);
    expect(priceInputValid("-1.123", undefined, true)).toBe(true);
    expect(priceInputValid("-1.123")).toBe(false);
  });
  it("invalidates preview after editing without request key or fingerprint", () => {
    const command = usePortfolioCommand();
    command.accept({ canSave: true } as never);
    expect(command.canSave()).toBe(true);
    command.changed();
    expect(command.canSave()).toBe(false);
    expect(command).not.toHaveProperty("requestKey");
    expect(command).not.toHaveProperty("fingerprint");
    expect(
      writeErrorText(Object.assign(new Error("版本冲突"), { code: 409 })),
    ).toContain("刷新持仓版本后重新预览");
    expect(
      writeErrorText(Object.assign(new Error("金额非法"), { code: 400 })),
    ).toBe("金额非法");
  });
  it("uses Shanghai prior-day end and leaves current day as current query", () => {
    expect(cutoffForDate("2026-01-01")).toBe("2026-01-01T23:59:59");
    expect(cutoffForDate(localDate())).toBeUndefined();
  });
  it("resolves four actual dynamic views and only prefers granted dashboard", () => {
    const routes = buildDynamicRoutes([
      {
        routeName: "Portfolio",
        path: "/portfolio",
        hidden: false,
        component: "Layout",
        meta: { menuName: "持仓管理" },
        children: ["dashboard", "positions", "trades", "actions"].map((x) => ({
          routeName: "Portfolio" + x,
          path: x,
          hidden: false,
          component: `portfolio/${x}/index`,
          meta: { menuName: x },
        })),
      },
    ]);
    expect(routes[0]?.children?.every((r) => !r.meta?.loadError)).toBe(true);
    expect(portfolioHomePath(routes, ["portfolio:dashboard:view"])).toBe(
      "/portfolio/dashboard",
    );
    expect(portfolioHomePath(routes, ["portfolio:position:view"])).toBe(
      "/portfolio/positions",
    );
    expect(
      portfolioHomePath(
        routes[0]?.children?.filter((r) => r.path != "/portfolio/dashboard") ||
          [],
        ["portfolio:dashboard:view"],
      ),
    ).toBe("/portfolio/positions");
    expect(portfolioHomePath([], ["portfolio:dashboard:view"])).toBe("/403");
    expect(menuComponentPaths).not.toContain("portfolio/fees/index");
  });
});
describe("portfolio four mounted management pages", () => {
  it("dashboard preserves unknown total and labels partial coverage", async () => {
    const w = render(Dashboard);
    await flushPromises();
    expect(m.summary).toHaveBeenCalledWith(undefined);
    expect(w.text()).toContain("覆盖率");
    expect(w.text()).toContain("50.000%");
    expect(w.text()).toContain("已覆盖部分市值 1,234.500 元");
    expect(w.text()).toContain("缺少完整依据");
    expect(w.text()).not.toContain("INCOMPLETE");
    expect(
      w
        .findAll(".portfolio-metric strong")
        .filter((e) => e.text() === "—")
        .every(
          (e) =>
            !e.classes().includes("portfolio-positive") &&
            !e.classes().includes("portfolio-negative"),
        ),
    ).toBe(true);
  });
  it("income charts omit missing items rather than publishing NaN aria values", async () => {
    m.summary.mockResolvedValue({
      ...summary,
      incomeItems: [
        {
          type: "REALIZED",
          name: "交易盈亏",
          amount: "394",
          partialAmount: "394",
          status: "CONFIRMED",
        },
        {
          type: "UNREALIZED",
          name: "浮动盈亏",
          amount: null,
          partialAmount: null,
          status: "INCOMPLETE",
        },
      ],
    });
    const w = render(Dashboard);
    await flushPromises();
    const chart = w.findAllComponents({ name: "BaseChart" })[0];
    expect(chart?.props("option").xAxis.data).toEqual(["交易盈亏"]);
    expect(chart?.props("option").series[0].data).toHaveLength(1);
  });
  it("formats chart tooltips from original decimal strings and keeps percentages at three places", async () => {
    m.summary.mockResolvedValue({
      ...summary,
      valuationCoverageRate: "12.3456",
      costAllocation: [
        {
          positionId: "1",
          assetType: "STOCK",
          symbol: "SH600000",
          name: "测试大额",
          amount: "99999999999999999999.9995",
          costStatus: "VERIFIED",
        },
      ],
      incomeItems: [
        {
          type: "REALIZED",
          name: "交易盈亏",
          amount: "-1.2345",
          partialAmount: "-1.2345",
          status: "CONFIRMED",
        },
      ],
    });
    const wrapper = render(Dashboard);
    await flushPromises();
    const charts = wrapper.findAllComponents({ name: "BaseChart" });
    const cost = charts[0]?.props("option");
    const income = charts[1]?.props("option");
    expect(cost.tooltip.formatter({ dataIndex: 0, value: 1e20 })).toBe(
      "测试大额\n100,000,000,000,000,000,000.000 元",
    );
    expect(income.tooltip.formatter([{ dataIndex: 0, value: -1.2345 }])).toBe(
      "交易盈亏\n-1.235 元",
    );
    expect(income.yAxis.axisLabel.formatter(1)).toBe("1.000");
    expect(cost.aria.label.description).toContain(
      "100,000,000,000,000,000,000.000元",
    );
    expect(wrapper.text()).toContain("12.346%");
  });
  it("empty dashboard is an onboarding view without invented missing totals", async () => {
    m.summary.mockResolvedValue({
      ...summary,
      status: "EMPTY",
      holdingCount: 0,
      positionCount: 0,
      message: "尚无持仓",
      valuationCoverageRate: null,
    });
    const w = render(Dashboard);
    await flushPromises();
    expect(w.text()).toContain("尚未建立个人账本");
    expect(w.text()).not.toContain("缺少完整依据");
  });
  it("positions filters use server page and historical cutoff with real empty state", async () => {
    const w = render(Positions);
    await flushPromises();
    expect(m.page).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 10,
      holdingOnly: true,
    });
    expect(w.text()).toContain("暂无持仓");
    const sort = w
      .findAllComponents({ name: "ElSelect" })
      .find((e) => e.props("placeholder") === "排序指标");
    sort?.vm.$emit("update:modelValue", "unrealizedPnl");
    const direction = w
      .findAllComponents({ name: "ElSelect" })
      .find((e) => e.props("placeholder") === "排序方向");
    direction?.vm.$emit("update:modelValue", "DESC");
    await flushPromises();
    await w.get('input[placeholder="代码或名称"]').setValue("600000");
    await click("查询");
    expect(m.page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: "600000",
        pageNum: 1,
        sortBy: "unrealizedPnl",
        sortDirection: "DESC",
      }),
    );
  });
  it("keeps row cutoff when date is unsubmitted or reload fails, then applies successful history atomically", async () => {
    m.page.mockResolvedValue({ list: [position], total: 1 });
    const w = render(Positions);
    await flushPromises();
    const datePicker = w.findComponent({ name: "ElDatePicker" });
    datePicker.vm.$emit("update:modelValue", "2026-01-01");
    await flushPromises();
    expect(w.findComponent(PositionDrawer).props("asOf")).toBeUndefined();
    expect(w.findAll("button").some((b) => b.text() === "期初录入")).toBe(true);
    await click("查看详情");
    expect(m.get).toHaveBeenCalledWith(1);
    expect(m.history).not.toHaveBeenCalled();
    w.findComponent(PositionDrawer).vm.$emit("update:modelValue", false);
    await flushPromises();
    m.page.mockRejectedValueOnce(new Error("查询失败"));
    await click("查询");
    expect(w.text()).toContain("测试银行");
    expect(w.findComponent(PositionDrawer).props("asOf")).toBeUndefined();
    expect(w.findAll("button").some((b) => b.text() === "期初录入")).toBe(true);
    m.page.mockResolvedValueOnce({
      list: [{ ...position, currentQuantity: 50 }],
      total: 1,
    });
    await click("查询");
    expect(w.findComponent(PositionDrawer).props("asOf")).toBe(
      "2026-01-01T23:59:59",
    );
    expect(w.findAll("button").some((b) => b.text() === "期初录入")).toBe(
      false,
    );
    await click("查看详情");
    expect(m.history).toHaveBeenCalledWith(1, "2026-01-01T23:59:59");
  });
  it("trades shows readonly detail and hides mutating commands without permission", async () => {
    m.auth.permissionCodes = ["portfolio:trade:view"];
    m.page.mockResolvedValue({
      list: [
        {
          id: 5,
          nameSnapshot: "测试银行",
          tradeType: "SELL",
          recordStatus: "ACTIVE",
          confirmationStatus: "RECHECK",
          finalPnl: "1188",
        },
      ],
      total: 1,
    });
    const w = render(Trades);
    await flushPromises();
    expect(w.text()).toContain("待复核");
    expect(w.text()).not.toContain("录入买入");
    expect(w.text()).not.toContain("作废");
    expect(w.text()).toContain("详情");
  });
  it("zero holding disables new sell", async () => {
    m.list.mockResolvedValue([{ ...position, currentQuantity: 0 }]);
    const w = render(Trades);
    await flushPromises();
    expect(w.text()).toContain("录入卖出");
    expect(button("录入卖出").disabled).toBe(true);
  });
  it("actions distinguishes pending and uses explicit mutation permission", async () => {
    m.auth.permissionCodes = ["portfolio:action:view"];
    m.page.mockResolvedValue({
      list: [
        {
          id: 1,
          positionId: 1,
          actionType: "CASH_DIVIDEND",
          businessDate: "2026-10-01",
          recordStatus: "PENDING",
          cashIncome: null,
          costDelta: null,
        },
      ],
      total: 1,
    });
    const w = render(Actions);
    await flushPromises();
    expect(w.text()).toContain("待处理");
    expect(w.text()).not.toContain("记录公司行动");
    expect(w.text()).not.toContain("原子更正");
  });
});
describe("portfolio real drawers and financial commands", () => {
  it("buy preview uses backend amount while preserving explicit zero fee and string price", async () => {
    render(TradeDrawer, { modelValue: true, kind: "BUY", position });
    await flushPromises();
    await fill("数量", "100");
    await fill("成交单价", "10.001");
    const feeSelect = [
      ...document.body.querySelectorAll<HTMLElement>(".el-form-item"),
    ]
      .find((e) => e.textContent?.includes("费用依据"))
      ?.querySelector<HTMLElement>(".el-select");
    feeSelect?.click();
    await flushPromises();
    [
      ...document.body.querySelectorAll<HTMLElement>(
        ".el-select-dropdown__item",
      ),
    ]
      .find((e) => e.textContent?.includes("人工实际费用"))
      ?.click();
    await flushPromises();
    await fill("实际费用合计", "0");
    await click("预览核算");
    expect(input("成交金额").value).toBe("1,000.000");
    expect(button("确认入账").disabled).toBe(false);
    await click("确认入账");
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actualFee: "0",
        price: "10.001",
        grossAmount: undefined,
        quantity: 100,
        expectedVersion: 3,
      }),
    );
  });
  it("form edits invalidate preview and uncertain writes require reading records before explicit reentry", async () => {
    render(TradeDrawer, { modelValue: true, kind: "BUY", position });
    await flushPromises();
    await fill("数量", "100");
    await fill("成交单价", "10");
    await click("预览核算");
    await fill("成交单价", "10.01");
    expect(button("确认入账").disabled).toBe(true);
    await click("预览核算");
    m.create.mockRejectedValueOnce(new Error("请求超时，结果未确认"));
    await click("确认入账");
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(button("确认入账").disabled).toBe(true);
    m.list.mockResolvedValueOnce([]);
    await click("读取流水核对");
    expect(m.list).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: 1 }),
    );
    await click("已核对未入账，重新预览");
    expect(m.create).toHaveBeenCalledTimes(1);
    await click("预览核算");
    await click("确认入账");
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create.mock.calls[1]?.[0]).not.toHaveProperty("requestKey");
  });
  it("allows price and quantity with fee pending instead of silently filling zero", async () => {
    m.preview.mockResolvedValueOnce({
      canSave: true,
      message: "成交可记录，费用待补；不按零处理",
      before: position,
      after: { ...position, remainingCost: null, costStatus: "UNVERIFIED" },
      trade: {
        grossAmount: "1000.00",
        actualFee: null,
        estimatedFee: null,
        feeMode: "UNCONFIGURED",
        finalPnl: null,
      },
    });
    render(TradeDrawer, { modelValue: true, kind: "BUY", position });
    await flushPromises();
    await fill("数量", "100");
    await fill("成交单价", "10");
    await click("预览核算");
    expect(document.body.textContent).toContain("费用待补");
    expect(button("确认入账").disabled).toBe(false);
    await click("确认入账");
    const input = m.create.mock.calls[0]?.[0];
    expect(input.grossAmount).toBeUndefined();
    expect(input.actualFee).toBeUndefined();
    expect(input.estimatedFee).toBeUndefined();
    expect(input.settlementAmount).toBeUndefined();
    expect(input).not.toHaveProperty("requestKey");
  });
  it("closed historical SELL replacement retains feeDetails and uses one replace command", async () => {
    const original = {
      id: 3,
      positionId: 1,
      tradeType: "SELL",
      quantity: 100,
      businessDate: "2026-01-01",
      price: "12",
      grossAmount: "1200",
      actualFee: "0",
      feeDetails: '{"commission":0}',
      confirmedNetPnl: "1582",
      confirmationScope: "CYCLE",
      confirmationNote: "核对结单",
      remark: "旧备注",
    } as PortfolioTrade;
    render(TradeDrawer, {
      modelValue: true,
      kind: "SELL",
      position: { ...position, currentQuantity: 0 },
      original,
    });
    await flushPromises();
    await fill("更正原因", "更正凭单");
    await click("预览核算");
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 3,
        replacement: expect.objectContaining({
          feeDetails: '{"commission":0}',
          confirmedNetPnl: "1582",
        }),
      }),
    );
    await click("确认入账");
    expect(m.replace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, reason: "更正凭单" }),
    );
    expect(m.void).not.toHaveBeenCalled();
  });
  it("opening allows unknown cost without fabricating trade money", async () => {
    render(TradeDrawer, { modelValue: true, kind: "OPENING", position });
    await flushPromises();
    await fill("数量", "100");
    await click("预览核算");
    await click("确认入账");
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tradeType: "OPENING",
        openingUnitCost: undefined,
        openingCostVerified: false,
      }),
    );
    expect(m.create.mock.calls[0]?.[0]).not.toHaveProperty("price");
  });
  it("opens by unit cost and shows backend total with three-place display without recomputing it", async () => {
    m.preview.mockResolvedValueOnce({
      canSave: true,
      after: {
        ...position,
        currentQuantity: 24000,
        remainingCost: "146712.00000000",
      },
      trade: { openingUnitCost: "6.113", openingCost: "146712.00" },
    });
    render(TradeDrawer, { modelValue: true, kind: "OPENING", position });
    await flushPromises();
    await fill("数量", "24000");
    await fill("期初每股 / 份成本", "6.113");
    await click("预览核算");
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({ openingUnitCost: "6.113", quantity: 24000 }),
    );
    expect(m.preview.mock.calls[0]?.[0]).not.toHaveProperty("openingCost");
    expect(document.body.textContent).toContain(
      "期初总成本（后端计算）146,712.000",
    );
    await click("确认入账");
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({ openingUnitCost: "6.113" }),
    );
  });
  it("keeps legacy opening total mode without inventing a historical unit price", async () => {
    const original = {
      id: "8",
      tradeType: "OPENING",
      quantity: 24000,
      businessDate: "2026-01-01",
      openingCost: "146712.00",
      openingUnitCost: null,
      openingCostVerified: true,
    } as PortfolioTrade;
    const wrapper = render(TradeDrawer, {
      modelValue: true,
      kind: "OPENING",
      position,
      original,
    });
    await flushPromises();
    expect(input("期初总成本").value).toBe("146712.00");
    expect(
      wrapper.findComponent({ name: "ElRadioGroup" }).props("modelValue"),
    ).toBe("TOTAL");
    await fill("更正原因", "补充依据，不改期初事实");
    await click("预览核算");
    expect(m.preview.mock.calls[0]?.[0].replacement).toMatchObject({
      openingCost: "146712.00",
    });
    expect(m.preview.mock.calls[0]?.[0].replacement).not.toHaveProperty(
      "openingUnitCost",
    );
    wrapper
      .findComponent({ name: "ElRadioGroup" })
      .vm.$emit("update:modelValue", "UNIT");
    await flushPromises();
    await fill("期初每股 / 份成本", "6.113");
    expect(button("确认入账").disabled).toBe(true);
    await click("预览核算");
    expect(m.preview.mock.calls[1]?.[0].replacement).toMatchObject({
      openingUnitCost: "6.113",
    });
    expect(m.preview.mock.calls[1]?.[0].replacement).not.toHaveProperty(
      "openingCost",
    );
  });
  it("preserves old eight-place trade and broker prices unless the user changes their value", async () => {
    const original = {
      id: "8",
      tradeType: "SELL",
      quantity: 50,
      businessDate: "2026-01-01",
      price: "10.12345678",
      grossAmount: "506.17",
      actualFee: "0",
      brokerReference: {
        costBefore: "9.12345678",
        costAfter: "8.12345678",
        quantityRemaining: 50,
      },
    } as PortfolioTrade;
    render(TradeDrawer, { modelValue: true, kind: "SELL", position, original });
    await flushPromises();
    expect(input("成交单价").value).toBe("10.12345678");
    await fill("更正原因", "补充备注不修改原价");
    await click("预览核算");
    expect(m.preview.mock.calls[0]?.[0].replacement).toMatchObject({
      price: "10.12345678",
      brokerReference: { costBefore: "9.12345678", costAfter: "8.12345678" },
    });
    await fill("成交单价", "10.12345679");
    await click("预览核算");
    expect(m.preview).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("新填或改价最多三位小数");
    await fill("成交单价", "10.124");
    await fill("实际成交金额（有记录时覆盖", "506.20");
    await click("预览核算");
    expect(m.preview.mock.calls[1]?.[0].replacement.price).toBe("10.124");
  });
  it("active company action requires explicit three adjustments while pending is allowed", async () => {
    render(ActionDrawer, { modelValue: true, position });
    await flushPromises();
    await fill("业务原因", "待核对分红");
    await click("预览");
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({ pending: true, cashIncome: undefined }),
    );
    const switcher =
      document.body.querySelector<HTMLButtonElement>('[role="switch"]');
    switcher?.click();
    await flushPromises();
    await click("预览");
    expect(document.body.textContent).toContain(
      "生效时数量、成本、现金调整必须明确填写",
    );
    expect(m.preview).toHaveBeenCalledTimes(1);
    await fill("数量调整", "0");
    await fill("总成本调整", "0");
    await fill("现金收益", "180.00");
    await click("预览");
    await click("确认保存");
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pending: false,
        quantityDelta: 0,
        costDelta: "0",
        cashIncome: "180.00",
      }),
    );
  });
  it("valuation correction sends one atomic command with preserved precision", async () => {
    const valuation = {
      id: 8,
      positionId: 1,
      valuationAt: "2026-10-01T10:00:00",
      valuationPrice: "10.12345678",
      source: "MANUAL_VALUATION",
      recordStatus: "ACTIVE",
    };
    m.valuationList.mockResolvedValue([valuation]);
    render(PositionDrawer, { modelValue: true, id: 1 });
    await flushPromises();
    (
      document.body.querySelector<HTMLElement>(
        '[role="tab"][id$="valuation"]',
      ) ||
      [...document.body.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (e) => e.textContent?.includes("手工估值"),
      )
    )?.click();
    await flushPromises();
    await click("更正");
    expect(input("手工估值单价").value).toBe("10.12345678");
    await fill("更正原因", "更正估值凭单");
    await fill("手工估值单价", "10.12345679");
    await click("保存原子替代");
    expect(m.replace).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("新填或改价最多三位小数");
    await fill("手工估值单价", "10.12345678");
    await click("保存原子替代");
    expect(m.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 8,
        replacement: expect.objectContaining({
          valuationPrice: "10.12345678",
          expectedVersion: 3,
        }),
      }),
    );
    expect(m.void).not.toHaveBeenCalled();
  });
  it("historical detail calls history and never offers current mutation actions", async () => {
    const w = render(PositionDrawer, {
      modelValue: true,
      id: 1,
      asOf: "2026-01-01T23:59:59",
    });
    await flushPromises();
    expect(m.history).toHaveBeenCalledWith(1, "2026-01-01T23:59:59");
    expect(w.text()).not.toContain("新增手工估值");
    expect(w.text()).not.toContain("买入");
  });
  it("trade operations load minimal write context without position view permission", async () => {
    m.auth.permissionCodes = ["portfolio:trade:view", "portfolio:trade:add"];
    const w = render(Trades);
    await flushPromises();
    expect(m.contexts).toHaveBeenCalledWith({ pageNum: 1, pageSize: 100 });
    expect(m.list).not.toHaveBeenCalled();
    expect(w.text()).toContain("录入买入");
  });
  it("trade view exposes actual fees and calibration without write permissions", async () => {
    m.auth.permissionCodes = ["portfolio:trade:view"];
    const row = {
      id: 5,
      nameSnapshot: "测试银行",
      tradeType: "SELL",
      recordStatus: "VOID",
      confirmationStatus: "RECHECK",
      businessDate: "2026-01-01",
      quantity: 100,
      actualFee: "0",
      feeMode: "ACTUAL",
      feeSource: "HISTORICAL_ACTUAL",
      feeDetails: '{"commission":0}',
      confirmedNetPnl: "1582",
      basePnl: "1180",
      pnlAdjustment: "8",
      finalPnl: "1188",
      voidReason: "历史更正",
      replacesTradeId: 3,
    };
    m.page.mockResolvedValue({ list: [row], total: 1 });
    m.get.mockResolvedValue(row);
    render(Trades);
    await flushPromises();
    await click("详情");
    expect(m.get).toHaveBeenCalledWith(5);
    expect(document.body.textContent).toContain("历史更正");
    expect(document.body.textContent).toContain("独立校准额");
    expect(document.body.textContent).toContain("历史实际费用");
    expect(document.body.textContent).not.toContain("采用费率快照");
    expect(document.body.textContent).toContain('{"commission":0}');
  });
  it("records after-only broker observations without inventing a pre-trade cost or fee", async () => {
    const wrapper = render(TradeDrawer, {
      modelValue: true,
      kind: "BUY",
      position,
    });
    await flushPromises();
    await fill("数量", "100");
    await fill("成交单价", "10");
    const observer = wrapper
      .findAllComponents({ name: "ElCheckbox" })
      .find((component) => component.text().includes("记录券商持仓成本价"));
    observer?.vm.$emit("update:modelValue", true);
    await flushPromises();
    await fill("操作后券商持仓成本价", "9.876");
    await fill("操作后券商剩余数量", "200");
    await click("预览核算");
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        brokerReference: {
          costBefore: undefined,
          costAfter: "9.876",
          quantityAfter: 200,
          acceptInferredFee: false,
        },
      }),
    );
    expect(m.preview.mock.calls[0]?.[0]).not.toHaveProperty("actualFee");
    await click("确认入账");
    expect(m.create).toHaveBeenCalled();
  });
  it("previews first-buy after-only inference and explicitly adopts it as estimated without client money arithmetic", async () => {
    const reference: BrokerReference = {
      referenceType: "BUY",
      quantityBefore: 0,
      quantitySold: 0,
      quantityRemaining: 100,
      costBefore: null,
      costAfter: "10.012",
      costBeforeTotal: "0",
      costAfterTotal: "1001.20000000",
      grossAmount: "1000.00",
      sellPrice: null,
      inferredFee: "1.20000000",
      feeApplied: null,
      feeAdjustment: null,
      feeSource: null,
      referencePnl: null,
      referenceGrossPnl: null,
      referenceNetPnl: null,
      calculationVersion: "BROKER_DILUTED_V1",
      message: "首次零仓买入，仅为费用合计预估",
    };
    const result = {
      canSave: true,
      before: { ...position, currentQuantity: 0 },
      after: position,
      trade: { grossAmount: "1000.00", brokerReference: reference },
    };
    m.context.mockResolvedValue({ ...position, currentQuantity: 0 });
    m.preview.mockResolvedValueOnce(result).mockResolvedValueOnce({
      ...result,
      trade: {
        ...result.trade,
        estimatedFee: "1.20",
        feeMode: "ESTIMATED",
        brokerReference: {
          ...reference,
          feeApplied: "1.20",
          feeAdjustment: "0.00",
          feeSource: "BROKER_INFERRED_ESTIMATE",
        },
      },
    });
    const wrapper = render(TradeDrawer, {
      modelValue: true,
      kind: "BUY",
      position,
    });
    await flushPromises();
    await fill("数量", "100");
    await fill("成交单价", "10");
    wrapper
      .findAllComponents({ name: "ElCheckbox" })
      .find((component) => component.text().includes("记录券商持仓成本价"))
      ?.vm.$emit("update:modelValue", true);
    await flushPromises();
    await fill("操作后券商持仓成本价", "10.012");
    await fill("操作后券商剩余数量", "100");
    await click("预览核算");
    expect(wrapper.text()).toContain("1,001.200 − 0.000 − 1,000.000 = 1.200");
    await click("采纳反推值为预估费用");
    expect(button("确认入账").disabled).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
    await click("预览核算");
    const adopted = m.preview.mock.calls[1]?.[0];
    expect(adopted).toMatchObject({
      brokerReference: { costAfter: "10.012", acceptInferredFee: true },
    });
    expect(adopted).not.toHaveProperty("estimatedFee");
    expect(adopted).not.toHaveProperty("actualFee");
    expect(wrapper.text()).toContain("明确采纳反推（预估）");
    await click("确认入账");
    expect(m.create).toHaveBeenCalledWith(adopted);
  });
  it("retains a negative raw broker difference while manually adjusting a nonnegative estimate and server delta", async () => {
    const reference: BrokerReference = {
      referenceType: "PARTIAL",
      quantityBefore: 100,
      quantitySold: 50,
      quantityRemaining: 50,
      costBefore: "10",
      costAfter: "8",
      costBeforeTotal: "1000",
      costAfterTotal: "400",
      grossAmount: "590.00",
      sellPrice: "11.8",
      inferredFee: "-10.00",
      feeApplied: null,
      feeAdjustment: null,
      feeSource: null,
      referencePnl: "100.00",
      referenceGrossPnl: null,
      referenceNetPnl: null,
      calculationVersion: "BROKER_DILUTED_V1",
      message: "反推差额负值不能直接采纳",
    };
    const result = {
      canSave: true,
      before: position,
      after: position,
      trade: { brokerReference: reference },
    };
    m.preview.mockResolvedValueOnce(result).mockResolvedValueOnce({
      ...result,
      trade: {
        brokerReference: {
          ...reference,
          feeApplied: "2.00",
          feeAdjustment: "12.00",
          feeSource: "MANUAL_ESTIMATE",
        },
      },
    });
    const wrapper = render(TradeDrawer, {
      modelValue: true,
      kind: "SELL",
      position,
    });
    await flushPromises();
    await fill("数量", "50");
    await fill("成交单价", "11.8");
    wrapper
      .findAllComponents({ name: "ElCheckbox" })
      .find((component) => component.text().includes("记录券商持仓成本价"))
      ?.vm.$emit("update:modelValue", true);
    await flushPromises();
    await fill("操作前券商持仓成本价", "10");
    await fill("操作后券商持仓成本价", "8");
    await click("预览核算");
    expect(button("采纳反推值为预估费用").disabled).toBe(true);
    await click("手动调整预估费用");
    expect(button("确认入账").disabled).toBe(true);
    await fill("最终采用的预估费用", "2.00");
    await fill("预估费用调整说明", "券商成本舍入差异，暂以2元预估待核对");
    await click("预览核算");
    expect(m.preview.mock.calls[1]?.[0]).toMatchObject({
      estimatedFee: "2.00",
      brokerReference: {
        costBefore: "10",
        costAfter: "8",
        acceptInferredFee: false,
      },
      remark: "券商成本舍入差异，暂以2元预估待核对",
    });
    expect(wrapper.text()).toContain("采用费用与反推值差额");
    expect(wrapper.text()).toContain("12.000 元");
    expect(wrapper.text()).toContain("590.000 + 400.000 − 1,000.000 = -10.000");
    await click("确认入账");
    expect(m.create).toHaveBeenCalledWith(m.preview.mock.calls[1]?.[0]);
  });
  it("shows CYCLE cumulative confirmation while unknown last-trade profit remains missing", async () => {
    m.preview.mockResolvedValueOnce({
      canSave: true,
      message: "本轮已确认，前序未知故无法拆分最后一笔",
      before: position,
      after: { ...position, currentQuantity: 0, realizedPnl: "1582.00" },
      trade: {
        grossAmount: "1200.00",
        feeMode: "UNCONFIGURED",
        actualFee: null,
        estimatedFee: null,
        finalPnl: null,
        confirmedNetPnl: "1582.00",
        confirmationScope: "CYCLE",
      },
    });
    render(TradeDrawer, { modelValue: true, kind: "SELL", position });
    await flushPromises();
    await fill("数量", "100");
    await fill("成交单价", "12");
    await fill("本轮累计交易净盈亏", "1582.00");
    await fill("确认依据", "券商本轮交易结算核对，不含分红税");
    await click("预览核算");
    expect(document.body.textContent).toContain(
      "本轮累计交易净盈亏（人工确认）",
    );
    expect(document.body.textContent).toContain("1,582.00");
    const lastProfit = [
      ...document.body.querySelectorAll(".portfolio-preview dl>div"),
    ].find((element) =>
      element.querySelector("dt")?.textContent?.includes("本次交易盈亏"),
    );
    expect(lastProfit?.querySelector("dd")?.textContent).toBe("—");
    await click("确认入账");
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationScope: "CYCLE",
        confirmedNetPnl: "1582.00",
      }),
    );
  });
  it("keeps broker reference formulas separate from actual ledger profit and flags negative differences", () => {
    const reference = {
      referenceType: "PARTIAL",
      quantityBefore: 200,
      quantitySold: 100,
      quantityRemaining: 100,
      costBefore: "10",
      costAfter: "11",
      costBeforeTotal: "2000",
      costAfterTotal: "1100",
      grossAmount: "800",
      sellPrice: "8",
      inferredFee: "-100",
      feeApplied: null,
      feeSource: null,
      referencePnl: "-100",
      referenceGrossPnl: null,
      referenceNetPnl: null,
      calculationVersion: "BROKER_DILUTED_V1",
      message: "仅供观察",
    } as BrokerReference;
    const wrapper = render(BrokerReferenceDetails, { reference });
    expect(wrapper.text()).toContain("反推差额为负");
    expect(wrapper.text()).toContain("不能采纳为费用");
    expect(wrapper.text()).toContain(
      "800.000 + 1,100.000 − 2,000.000 = -100.000",
    );
    expect(wrapper.text()).toContain("券商摊薄口径测算 / 对账");
  });
  it("records positive manual tax against an explicit cycle without client-side negative cash calculation", async () => {
    const wrapper = render(ActionDrawer, { modelValue: true, position });
    await flushPromises();
    const actionSelector = wrapper.findAllComponents({ name: "ElSelect" })[0];
    actionSelector?.vm.$emit("update:modelValue", "TAX_WITHHOLDING");
    await flushPromises();
    document.body.querySelector<HTMLElement>('[role="switch"]')?.click();
    await flushPromises();
    await fill("业务原因", "补录尚未扣除的分红税");
    await fill("手工补扣税额", "-2.35");
    await click("预览");
    expect(m.preview).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("补扣税额须为正数");
    await fill("手工补扣税额", "2.35");
    await fill("所属周期起始记录ID", "9223372036854775807");
    await fill("业务原因", "补录尚未扣除的分红税");
    await fill("核对依据", "券商交割单已核对，未在原到账中扣除");
    await click("预览");
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "TAX_WITHHOLDING",
        taxAmount: "2.35",
        cycleStartTradeId: "9223372036854775807",
        cashIncome: undefined,
        costDelta: undefined,
        quantityDelta: undefined,
        pending: false,
      }),
    );
    expect(document.body.textContent).not.toContain("数量调整（股 / 份）");
    await click("确认保存");
    expect(m.create).toHaveBeenCalled();
  });
  it("displays server-returned tax as negative independent cash without changing quantity or cost", async () => {
    m.auth.permissionCodes = ["portfolio:action:view"];
    m.page.mockResolvedValueOnce({
      list: [
        {
          id: "9223372036854775807",
          positionId: 1,
          actionType: "TAX_WITHHOLDING",
          businessDate: "2026-10-01",
          taxAmount: "2.35",
          quantityDelta: 0,
          costDelta: "0.00",
          cashIncome: "-2.35",
          recordStatus: "ACTIVE",
          reason: "补录未扣税",
        },
      ],
      total: 1,
    });
    const wrapper = render(Actions);
    await flushPromises();
    expect(wrapper.text()).toContain("手工补扣税");
    expect(wrapper.text()).toContain("-2.35");
    expect(wrapper.text()).not.toContain("记录公司行动");
  });
});
