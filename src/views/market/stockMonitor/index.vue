<script setup lang="ts">
import { Refresh, Search, Setting } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { getStockMonitorDashboard } from "@/api/market";
import { buildStockPriceOption } from "@/charts/marketOptions";
import BaseChart from "@/components/market/BaseChart.vue";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import type { StockMonitorDashboard, StockMonitorStock } from "@/types/market";
import { formatAmount, formatPercent, formatPlainNumber, valueTone } from "@/utils/market";
import { canAccess } from "@/utils/permission";
import { isHistoricalStock } from "@/utils/stockMonitor";

const PAGE_SIZE = 4;
const POLL_INTERVAL = 120_000;
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const dashboard = ref<StockMonitorDashboard | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const pageNum = ref(1);
const keyword = ref("");
const highlighted = ref("");
let pollId: ReturnType<typeof setInterval> | undefined;
let highlightId: ReturnType<typeof setTimeout> | undefined;
let requestInFlight = false;
let active = false;

const canViewConfig = computed(() => canAccess(authStore.permissionCodes, "system:stock-monitor:view"));
const stocks = computed(() => dashboard.value?.stocks ?? []);
const pageCount = computed(() => Math.max(1, Math.ceil(stocks.value.length / PAGE_SIZE)));
const visibleStocks = computed(() => stocks.value.slice((pageNum.value - 1) * PAGE_SIZE, pageNum.value * PAGE_SIZE));

function shanghaiTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

function formatCurrency(value: number | null): string {
  return formatAmount(value).replace(/^\+/, "");
}

function formatAveragePrice(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2, maximumFractionDigits: 3,
  });
}

function formatVolume(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}

function quoteLabel(stock: StockMonitorStock): string {
  if (!dashboard.value?.xqEnabled) return "采集未开启";
  if (stock.quote.status === "DISABLED") return "该股采集未开启";
  if (stock.quote.status === "ERROR") return "报价缓存不可用";
  if (stock.quote.status === "STALE" && isHistoricalStock(stock)) {
    return `历史数据 · ${stock.quote.tradeDate} · 已过期`;
  }
  if (stock.quote.status === "STALE") return "数据已过期";
  if (isHistoricalStock(stock)) return `历史数据 · ${stock.quote.tradeDate}`;
  return "采样数据";
}

function quoteMessage(stock: StockMonitorStock): string {
  if (stock.quote.status === "DISABLED") return "该股暂无可用报价和曲线。";
  if (stock.quote.status === "ERROR") return "报价或曲线缓存缺失，暂无可展示的行情。";
  if (stock.quote.status === "STALE") return "保留最近一次有效报价，请核对源时间。";
  if (!stock.series.length) return "尚无实际价格采样点。";
  return "";
}

function hasChart(stock: StockMonitorStock): boolean {
  return (stock.quote.status === "FRESH" || stock.quote.status === "STALE") && stock.series.length > 0;
}

async function loadDashboard(): Promise<void> {
  if (requestInFlight) return;
  requestInFlight = true;
  loading.value = true;
  try {
    dashboard.value = await getStockMonitorDashboard();
    errorMessage.value = "";
    pageNum.value = Math.min(pageNum.value, pageCount.value);
  } catch (error) {
    dashboard.value = null;
    errorMessage.value = error instanceof Error ? error.message : "个股监控加载失败";
  } finally {
    loading.value = false;
    requestInFlight = false;
  }
}

function locateStock(): void {
  const search = keyword.value.trim().toUpperCase();
  if (!search) return;
  const index = stocks.value.findIndex((item) =>
    item.symbol.includes(search) || item.code.includes(search) || item.name.includes(search));
  if (index < 0) {
    ElMessage.warning("未在已启用股票中找到匹配项");
    return;
  }
  pageNum.value = Math.floor(index / PAGE_SIZE) + 1;
  highlighted.value = stocks.value[index]!.symbol;
  if (highlightId) clearTimeout(highlightId);
  highlightId = setTimeout(() => { highlighted.value = ""; }, 2_000);
}

async function initializePermissions(): Promise<void> {
  if (!authStore.isAuthenticated || permissionStore.initialized) return;
  try {
    await permissionStore.initialize(router);
  } catch {
    // 公开行情继续可读；配置入口只在权限加载成功后显示。
  }
}

async function openConfig(): Promise<void> {
  if (!canViewConfig.value) return;
  await permissionStore.initialize(router);
  await router.push("/system/stockMonitor");
}

onMounted(async () => {
  active = true;
  await Promise.all([loadDashboard(), initializePermissions()]);
  if (!active) return;
  const initial = route.query.symbol ?? route.query.stockCode;
  if (typeof initial === "string") {
    keyword.value = initial;
    locateStock();
    await router.replace({ query: {} });
  }
  pollId = setInterval(() => { void loadDashboard(); }, POLL_INTERVAL);
});

onBeforeUnmount(() => {
  active = false;
  if (pollId) clearInterval(pollId);
  if (highlightId) clearTimeout(highlightId);
});
</script>

<template>
  <div class="stock-monitor-page">
    <header class="monitor-heading">
      <div>
        <p>STOCK PRICE MONITOR · V1</p>
        <h1>个股监控大屏</h1>
        <span>最多 10 只股票，每页展示 4 只；约 2 分钟采样，曲线仅使用实际源时间点</span>
      </div>
      <div class="monitor-tools">
        <span class="monitor-count">{{ stocks.length }} / 10 只</span>
        <span class="monitor-count">第 {{ pageNum }} / {{ pageCount }} 页</span>
        <div class="quick-search">
          <el-input v-model="keyword" clearable placeholder="股票代码或名称" :prefix-icon="Search" @keyup.enter="locateStock" />
          <button type="button" @click="locateStock">定位</button>
        </div>
        <button class="outline-button" type="button" :disabled="loading" @click="loadDashboard">
          <el-icon><Refresh /></el-icon>重新加载
        </button>
        <button v-if="canViewConfig" class="outline-button" type="button" @click="openConfig">
          <el-icon><Setting /></el-icon>配置管理
        </button>
      </div>
    </header>

    <p v-if="dashboard && !dashboard.xqEnabled" class="monitor-notice" role="status">
      雪球采集开关未开启，仅展示监控清单。
    </p>
    <p v-else-if="dashboard?.tradeDate" class="monitor-notice" role="status">
      最近交易日：{{ dashboard.tradeDate }}。报价请以每张卡片的源时间和状态为准。
    </p>
    <p class="monitor-disclaimer">价格采样、涨跌幅和成交额仅供观察，不构成交易建议。</p>

    <div v-if="loading && !dashboard" class="monitor-skeleton-grid" aria-label="个股监控加载中">
      <div v-for="item in 4" :key="item" class="monitor-skeleton" />
    </div>
    <div v-else-if="errorMessage" class="monitor-empty" role="alert">
      <strong>个股监控不可用</strong><span>{{ errorMessage }}</span>
      <button class="outline-button" type="button" @click="loadDashboard">重新加载</button>
    </div>
    <div v-else-if="stocks.length === 0" class="monitor-empty">
      <strong>尚未启用监控股票</strong>
      <span>管理员可在配置管理中从交易所股票字典选择最多 10 只。</span>
      <button v-if="canViewConfig" class="outline-button" type="button" @click="openConfig">打开配置管理</button>
    </div>
    <div v-else class="stock-card-grid">
      <section v-for="stock in visibleStocks" :key="stock.symbol" class="stock-card" :class="{ 'is-highlighted': highlighted === stock.symbol }">
        <header class="stock-card__header">
          <div>
            <h2>{{ stock.name }} <small>{{ stock.symbol }}</small></h2>
            <span>{{ dashboard?.xqEnabled ? (stock.profile.industry || "行业未同步") : stock.market + " 市场" }}</span>
          </div>
          <div class="stock-card__state" :class="`state-${stock.quote.status.toLowerCase()}`">
            <strong>{{ quoteLabel(stock) }}</strong>
            <small v-if="dashboard?.xqEnabled">源时间 {{ shanghaiTime(stock.quote.sourceTime) }}</small>
          </div>
        </header>
        <template v-if="dashboard?.xqEnabled">
          <div class="stock-card__metrics">
            <div><small>价格 · 元</small><strong>{{ formatPlainNumber(stock.quote.price) }}</strong></div>
            <div><small>昨收 · 元</small><strong>{{ formatPlainNumber(stock.quote.previousClose) }}</strong></div>
            <div><small>今开 · 元</small><strong>{{ formatPlainNumber(stock.quote.open) }}</strong></div>
            <div><small>最低 · 元</small><strong>{{ formatPlainNumber(stock.quote.low) }}</strong></div>
            <div><small>最高 · 元</small><strong>{{ formatPlainNumber(stock.quote.high) }}</strong></div>
            <div><small>涨停 · 元</small><strong>{{ formatPlainNumber(stock.quote.limitUp) }}</strong></div>
            <div><small>跌停 · 元</small><strong>{{ formatPlainNumber(stock.quote.limitDown) }}</strong></div>
            <div><small>均价 · 元</small><strong>{{ formatAveragePrice(stock.quote.averagePrice) }}</strong></div>
            <div><small>涨跌幅</small><strong :class="`tone-${valueTone(stock.quote.changePercent)}`">{{ formatPercent(stock.quote.changePercent) }}</strong></div>
            <div><small>成交额 · 元</small><strong>{{ formatCurrency(stock.quote.amount) }}</strong></div>
            <div><small>成交量 · 股</small><strong>{{ formatVolume(stock.quote.volume) }}</strong></div>
            <div><small>交易日</small><strong>{{ stock.quote.tradeDate || "—" }}</strong></div>
          </div>
          <div class="stock-card__chart">
            <BaseChart
              v-if="hasChart(stock)" :option="buildStockPriceOption(stock.series)"
              :accessible-label="`${stock.name} ${stock.symbol}，${stock.quote.tradeDate} 实际源时间价格采样曲线，共 ${stock.series.length} 点`"
              height="240px"
            />
            <div v-else class="stock-chart-empty"><strong>{{ quoteLabel(stock) }}</strong><span>{{ quoteMessage(stock) }}</span></div>
          </div>
          <p v-if="quoteMessage(stock) && hasChart(stock)" class="stock-card__alert">{{ quoteMessage(stock) }}</p>
          <div class="stock-card__footer">
            <span>采集时间 {{ shanghaiTime(stock.quote.collectedAt) }}</span>
            <span>上市 {{ stock.profile.listingDate || "—" }}</span>
            <span>总市值 {{ formatCurrency(stock.profile.marketCap) }}</span>
          </div>
          <details v-if="hasChart(stock)" class="stock-accessible-table">
            <summary>查看价格采样表</summary>
            <div class="stock-table-scroll">
              <table>
                <thead><tr><th>实际源时间</th><th>价格 · 元</th></tr></thead>
                <tbody><tr v-for="point in stock.series" :key="point.time"><td>{{ shanghaiTime(point.time) }}</td><td>{{ formatPlainNumber(point.price) }}</td></tr></tbody>
              </table>
            </div>
          </details>
        </template>
        <p v-else class="stock-card__disabled">仅展示监控清单；报价、曲线和雪球资料暂不公开。</p>
      </section>
    </div>
    <el-pagination
      v-if="stocks.length > PAGE_SIZE" v-model:current-page="pageNum" class="monitor-pagination"
      background layout="prev, pager, next" :page-size="PAGE_SIZE" :total="stocks.length"
    />
  </div>
</template>

<style scoped>
.stock-monitor-page { display: grid; gap: 14px; color: var(--market-text); }
.monitor-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.monitor-heading p { margin: 0 0 3px; color: var(--market-primary); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
.monitor-heading h1 { margin: 0; font-size: clamp(20px, 1.5vw, 25px); }
.monitor-heading span, .monitor-tools { color: var(--market-muted); font-size: 12px; }
.monitor-tools { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.monitor-count { padding: 8px 10px; white-space: nowrap; border: 1px solid var(--market-border); border-radius: 8px; background: var(--market-panel); }
.quick-search { display: flex; gap: 6px; width: 270px; }
.quick-search :deep(.el-input) { min-width: 0; }
.quick-search button, .outline-button { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; color: #dbeafe; white-space: nowrap; border: 1px solid #3b82f6; border-radius: 8px; background: rgba(59,130,246,.14); cursor: pointer; }
.quick-search button:hover, .outline-button:hover { background: rgba(59,130,246,.24); }
.outline-button:disabled { opacity: .5; cursor: not-allowed; }
.monitor-notice { margin: 0; padding: 10px 14px; color: #bfdbfe; border: 1px solid rgba(59,130,246,.35); border-radius: 9px; background: rgba(59,130,246,.1); font-size: 12px; }
.monitor-disclaimer { margin: -5px 0 0; color: var(--market-muted); font-size: 11px; text-align: right; }
.stock-card-grid, .monitor-skeleton-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.stock-card { min-width: 0; padding: 15px; border: 1px solid var(--market-border); border-radius: 12px; background: var(--market-panel); }
.stock-card.is-highlighted { border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(59,130,246,.2); }
.stock-card__header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.stock-card__header h2 { margin: 0 0 5px; font-size: 16px; }
.stock-card__header h2 small { margin-left: 5px; color: var(--market-muted); font-size: 11px; font-weight: 400; }
.stock-card__header span, .stock-card__state small { color: var(--market-muted); font-size: 11px; }
.stock-card__state { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
.stock-card__state strong { color: #bfdbfe; font-size: 11px; }
.stock-card__state.state-error strong { color: #fecaca; }
.stock-card__state.state-stale strong { color: #fcd34d; }
.stock-card__metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--market-border); border-radius: 8px; background: var(--market-border); }
.stock-card__metrics > div { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 10px; background: #091423; }
.stock-card__metrics small { color: var(--market-muted); font-size: 11px; }
.stock-card__metrics strong { overflow: hidden; font-size: 14px; white-space: nowrap; text-overflow: ellipsis; }
.stock-card__metrics .tone-rise { color: #f87171; }
.stock-card__metrics .tone-fall { color: #4ade80; }
.stock-card__chart { min-height: 240px; margin-top: 12px; }
.stock-chart-empty, .monitor-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 240px; color: var(--market-muted); text-align: center; font-size: 12px; }
.stock-chart-empty strong, .monitor-empty strong { color: var(--market-text-secondary); font-size: 15px; }
.monitor-empty { min-height: 340px; padding: 20px; border: 1px solid var(--market-border); border-radius: 12px; background: var(--market-panel); }
.stock-card__disabled { margin: 8px 0 0; padding: 16px; color: var(--market-muted); border: 1px dashed var(--market-border); border-radius: 8px; font-size: 12px; }
.stock-card__alert { margin: 8px 0; color: #fcd34d; font-size: 11px; }
.stock-card__footer { display: flex; flex-wrap: wrap; gap: 7px 15px; padding-top: 8px; color: var(--market-muted); border-top: 1px solid var(--market-border); font-size: 11px; }
.stock-accessible-table { margin-top: 10px; color: var(--market-muted); font-size: 11px; }
.stock-accessible-table summary { min-height: 32px; cursor: pointer; }
.stock-table-scroll { max-height: 160px; overflow: auto; }
.stock-accessible-table table { width: 100%; border-collapse: collapse; }
.stock-accessible-table th, .stock-accessible-table td { padding: 6px; border-bottom: 1px solid var(--market-border); text-align: left; }
.monitor-pagination { display: flex; justify-content: center; }
.monitor-skeleton { min-height: 420px; border: 1px solid var(--market-border); border-radius: 12px; background: linear-gradient(100deg, #0b1728 30%, #102039 50%, #0b1728 70%); background-size: 240% 100%; animation: skeleton-move 1.4s linear infinite; }
@keyframes skeleton-move { to { background-position: -240% 0; } }
@media (max-width: 1100px) { .monitor-heading { align-items: flex-start; flex-direction: column; } .monitor-tools { justify-content: flex-start; } }
@media (max-width: 800px) { .stock-card-grid, .monitor-skeleton-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .quick-search { width: 100%; } .monitor-tools { justify-content: flex-start; } .stock-card__metrics { grid-template-columns: repeat(2, 1fr); } .monitor-disclaimer { text-align: left; } .stock-card__header { flex-wrap: wrap; } }
@media (prefers-reduced-motion: reduce) { .monitor-skeleton { animation: none; } }
</style>
