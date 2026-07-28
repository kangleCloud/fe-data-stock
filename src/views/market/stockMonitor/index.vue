<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  Collection,
  Refresh,
  Search,
  Setting,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import "element-plus/theme-chalk/el-message-box.css";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import * as marketApi from "@/api/market";
import { buildStockFundOption } from "@/charts/marketOptions";
import BaseChart from "@/components/market/BaseChart.vue";
import MarketPanel from "@/components/market/MarketPanel.vue";
import { useAuthStore } from "@/stores/auth";
import { useMarketStore } from "@/stores/market";
import type {
  ListingStatus,
  MarketDataStatus,
  MarketPageResponse,
  StockDictionaryItem,
  StockMonitorItem,
} from "@/types/market";
import {
  dataStatusLabels,
  formatAmount,
  formatDateTime,
  formatPercent,
  formatPlainNumber,
  valueTone,
} from "@/utils/market";
import { pageAfterSingleRowDelete } from "@/utils/pagination";
import { canAccess } from "@/utils/permission";

const PAGE_SIZE = 4;
const ENABLE_LIMIT = 10;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const marketStore = useMarketStore();

const monitorPage = ref<MarketPageResponse<StockMonitorItem>>({
  list: [],
  total: 0,
  pageNum: 1,
  pageSize: PAGE_SIZE,
  enabledTotal: 0,
});
const pageNum = ref(1);
const monitorStatus = ref<MarketDataStatus>("FRESH");
const monitorMessage = ref("");
const monitorLoading = ref(true);
const quickKeyword = ref("");
const highlightCode = ref("");

const dictionaryOpen = ref(false);
const dictionaryLoading = ref(false);
const dictionarySubmitting = ref("");
const dictionaryKeyword = ref("");
const dictionaryEnabled = ref<boolean | undefined>();
const dictionaryListingStatus = ref<ListingStatus | undefined>();
const dictionaryPageNum = ref(1);
const dictionaryPage = ref({
  list: [] as StockDictionaryItem[],
  total: 0,
});

const canManage = computed(() =>
  canAccess(authStore.permissionCodes, "market:stock:manage"),
);
const canSync = computed(() =>
  canAccess(authStore.permissionCodes, "market:stock:sync"),
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(monitorPage.value.enabledTotal / PAGE_SIZE)),
);

function cardSummary(stock: StockMonitorItem): string {
  return `${stock.stockName} ${stock.stockCode}，最新价 ${formatPlainNumber(stock.latestPrice)}，涨跌幅 ${formatPercent(stock.changePercent)}，资金流入 ${formatAmount(stock.inflow)}，资金流出 ${formatAmount(stock.outflow)}，资金净额 ${formatAmount(stock.netAmount)}。`;
}

async function loadMonitor(options?: {
  locateStockCode?: string;
}): Promise<void> {
  monitorLoading.value = true;
  try {
    const response = await marketApi.getStockMonitorPage({
      pageNum: pageNum.value,
      pageSize: PAGE_SIZE,
      locateStockCode: options?.locateStockCode,
    });
    monitorPage.value = response.data;
    monitorStatus.value = response.dataStatus;
    monitorMessage.value = response.message || "";
    marketStore.setEnabledTotal(response.data.enabledTotal);
    marketStore.markModule("stockMonitor", response);
    if (
      options?.locateStockCode &&
      response.data.locatedPageNum &&
      response.data.locatedPageNum !== pageNum.value
    ) {
      pageNum.value = response.data.locatedPageNum;
      await loadMonitor();
      highlightStock(options.locateStockCode);
    } else if (options?.locateStockCode) {
      highlightStock(options.locateStockCode);
    }
  } catch (error) {
    monitorStatus.value = monitorPage.value.list.length ? "STALE" : "ERROR";
    monitorMessage.value =
      error instanceof Error ? error.message : "个股资金刷新失败";
    marketStore.markModuleFailure(
      "stockMonitor",
      monitorMessage.value,
      monitorPage.value.list.length > 0,
    );
  } finally {
    monitorLoading.value = false;
  }
}

function highlightStock(stockCode: string): void {
  highlightCode.value = stockCode;
  window.setTimeout(() => {
    if (highlightCode.value === stockCode) highlightCode.value = "";
  }, 2_000);
}

async function locateStock(): Promise<void> {
  const keyword = quickKeyword.value.trim();
  if (!keyword) return;
  await loadMonitor({ locateStockCode: keyword });
  if (
    !monitorPage.value.list.some(
      (item) =>
        item.stockCode.includes(keyword) || item.stockName.includes(keyword),
    )
  ) {
    ElMessage.warning("未在已启用股票中找到匹配项");
  }
}

async function loadDictionary(): Promise<void> {
  dictionaryLoading.value = true;
  try {
    const response = await marketApi.getStockDictionaryPage({
      pageNum: dictionaryPageNum.value,
      pageSize: 10,
      keyword: dictionaryKeyword.value.trim() || undefined,
      enabled: dictionaryEnabled.value,
      listingStatus: dictionaryListingStatus.value,
    });
    dictionaryPage.value = response;
  } catch {
    // 行情接口已启用静默错误，抽屉内保留当前列表。
  } finally {
    dictionaryLoading.value = false;
  }
}

async function toggleStock(item: StockDictionaryItem): Promise<void> {
  if (!canManage.value) return;
  if (!item.enabled && monitorPage.value.enabledTotal >= ENABLE_LIMIT) {
    ElMessage.warning("最多同时启用10只股票，请先停用其他股票");
    return;
  }
  const action = item.enabled ? "停用" : "启用";
  await ElMessageBox.confirm(
    `${action} ${item.stockName}（${item.stockCode}）？${
      item.enabled ? "停用后将立即从实时监控中移除。" : ""
    }`,
    `${action}资金监控`,
    {
      confirmButtonText: action,
      cancelButtonText: "取消",
      type: item.enabled ? "warning" : "info",
    },
  );
  dictionarySubmitting.value = item.stockCode;
  try {
    if (item.enabled) {
      await marketApi.disableStock({ stockCode: item.stockCode });
    } else {
      await marketApi.enableStock({ stockCode: item.stockCode });
    }
    ElMessage.success(`${action}成功`);
    if (item.enabled && monitorPage.value.list.length === 1) {
      pageNum.value = pageAfterSingleRowDelete(pageNum.value, 1);
    }
    await Promise.all([loadDictionary(), loadMonitor()]);
  } finally {
    dictionarySubmitting.value = "";
  }
}

async function reorder(item: StockDictionaryItem, direction: "UP" | "DOWN") {
  if (!canManage.value || dictionarySubmitting.value) return;
  dictionarySubmitting.value = item.stockCode;
  try {
    await marketApi.reorderStock({ stockCode: item.stockCode, direction });
    ElMessage.success("显示顺序已更新");
    await Promise.all([loadDictionary(), loadMonitor()]);
  } finally {
    dictionarySubmitting.value = "";
  }
}

async function syncDictionary(): Promise<void> {
  dictionarySubmitting.value = "SYNC";
  try {
    await marketApi.syncStockDictionary();
    ElMessage.success("股票字典同步任务已提交");
    await loadDictionary();
  } finally {
    dictionarySubmitting.value = "";
  }
}

function openDictionary(): void {
  dictionaryOpen.value = true;
  void loadDictionary();
}

function resetDictionaryFilters(): void {
  dictionaryKeyword.value = "";
  dictionaryEnabled.value = undefined;
  dictionaryListingStatus.value = undefined;
  dictionaryPageNum.value = 1;
  void loadDictionary();
}

watch(() => marketStore.refreshSignal, () => loadMonitor(), { immediate: true });
watch(pageNum, () => loadMonitor());
watch(dictionaryPageNum, () => loadDictionary());

onMounted(() => {
  const stockCode = String(route.query.stockCode || "");
  if (stockCode) {
    quickKeyword.value = stockCode;
    void loadMonitor({ locateStockCode: stockCode });
    void router.replace({ query: {} });
  }
});
</script>

<template>
  <div class="stock-monitor-page">
    <section class="monitor-heading">
      <div>
        <p>STOCK FUND MONITOR</p>
        <h1>个股资金监控</h1>
      </div>
      <div class="monitor-heading__tools">
        <span>第 {{ pageNum }} / {{ pageCount }} 页</span>
        <span>已启用 {{ monitorPage.enabledTotal }} / {{ ENABLE_LIMIT }} 只</span>
        <div class="quick-search">
          <el-input
            v-model="quickKeyword"
            clearable
            placeholder="输入股票编号或名称快速定位"
            :prefix-icon="Search"
            @keyup.enter="locateStock"
          />
          <button type="button" @click="locateStock">定位</button>
        </div>
        <button class="dictionary-button" type="button" @click="openDictionary">
          <el-icon><Collection /></el-icon>
          股票字典与管理
        </button>
      </div>
    </section>

    <p class="monitor-disclaimer">
      资金流入、流出与净额均为行情数据观察指标，不构成收益承诺、买卖建议或交易指令。
    </p>

    <div
      v-if="monitorLoading && monitorPage.list.length === 0"
      class="monitor-skeleton-grid"
      aria-label="个股资金数据加载中"
    >
      <div v-for="item in 4" :key="item" class="monitor-skeleton" />
    </div>

    <MarketPanel
      v-else-if="monitorPage.enabledTotal === 0"
      title="尚未启用资金监控"
      status="NO_DATA"
      :has-data="false"
      message="股票字典中的全部股票均可检索。管理员可启用最多10只股票，启用后才会读取实时资金曲线。"
      class="monitor-empty-panel"
    >
      <template #retry>
        <button class="dictionary-button" type="button" @click="openDictionary">
          打开股票字典
        </button>
      </template>
    </MarketPanel>

    <div v-else class="stock-card-grid">
      <MarketPanel
        v-for="stock in monitorPage.list"
        :key="stock.stockCode"
        :title="`${stock.stockName} · ${stock.stockCode}`"
        :status="stock.dataStatus"
        :message="stock.message"
        :has-data="stock.points.length > 0"
        class="stock-card"
        :class="{ 'is-highlighted': highlightCode === stock.stockCode }"
      >
        <template #actions>
          <span class="stock-data-time">
            {{ dataStatusLabels[stock.dataStatus] }} ·
            {{ formatDateTime(stock.updateTime) }}
          </span>
        </template>
        <div class="stock-card__metrics">
          <div class="stock-price">
            <small>最新价</small>
            <strong>{{ formatPlainNumber(stock.latestPrice) }}</strong>
            <span :class="`tone-${valueTone(stock.changePercent)}`">
              {{ formatPercent(stock.changePercent) }}
            </span>
          </div>
          <div><small>当日成交额</small><strong>{{ formatAmount(stock.turnover) }}</strong></div>
          <div><small>换手率</small><strong>{{ formatPercent(stock.turnoverRate) }}</strong></div>
          <div><small>资金流入</small><strong class="tone-rise">流入 {{ formatAmount(stock.inflow) }}</strong></div>
          <div><small>资金流出</small><strong class="tone-fall">流出 {{ formatAmount(stock.outflow) }}</strong></div>
          <div><small>资金净额</small><strong :class="`tone-${valueTone(stock.netAmount)}`">{{ stock.netAmount != null && stock.netAmount >= 0 ? "净流入" : "净流出" }} {{ formatAmount(stock.netAmount) }}</strong></div>
        </div>
        <BaseChart
          v-if="stock.points.length"
          :option="buildStockFundOption(stock.points)"
          :accessible-label="cardSummary(stock)"
          height="270px"
        />
        <div v-else class="stock-chart-empty">
          <strong>{{ dataStatusLabels[stock.dataStatus] }}</strong>
          <span>{{ stock.message || "尚无有效资金数据点" }}</span>
        </div>
        <details class="stock-accessible-table">
          <summary>查看可访问数据表</summary>
          <div class="stock-table-scroll">
            <table>
              <thead><tr><th>时间</th><th>流入</th><th>流出</th><th>净额</th><th>最新价</th><th>涨跌幅</th></tr></thead>
              <tbody>
                <tr v-for="point in stock.points" :key="point.time">
                  <td>{{ formatDateTime(point.time) }}</td>
                  <td>{{ formatAmount(point.inflow) }}</td>
                  <td>{{ formatAmount(point.outflow) }}</td>
                  <td>{{ formatAmount(point.netAmount) }}</td>
                  <td>{{ formatPlainNumber(point.latestPrice) }}</td>
                  <td>{{ formatPercent(point.changePercent) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </MarketPanel>
    </div>

    <div v-if="monitorPage.enabledTotal > PAGE_SIZE" class="monitor-pagination">
      <el-pagination
        v-model:current-page="pageNum"
        background
        layout="prev, pager, next"
        :page-size="PAGE_SIZE"
        :total="monitorPage.enabledTotal"
      />
    </div>

    <p
      v-if="monitorStatus === 'STALE' || monitorStatus === 'ERROR'"
      class="monitor-error"
      aria-live="polite"
    >
      {{ monitorStatus === "STALE" ? "本次刷新失败，当前保留上次成功数据。" : "个股资金加载失败。" }}
      {{ monitorMessage }}
    </p>

    <el-drawer
      v-model="dictionaryOpen"
      title="A股股票字典"
      size="min(760px, 100vw)"
      class="stock-dictionary-drawer"
    >
      <div class="dictionary-intro">
        <div>
          <strong>沪深京A股统一字典</strong>
          <span>全部股票可检索，仅已启用股票进入实时资金监控。</span>
        </div>
        <el-button
          v-if="canSync"
          :icon="Refresh"
          :loading="dictionarySubmitting === 'SYNC'"
          @click="syncDictionary"
        >
          同步字典
        </el-button>
      </div>
      <div class="dictionary-filters">
        <el-input
          v-model="dictionaryKeyword"
          clearable
          placeholder="股票编号或名称"
          :prefix-icon="Search"
          @keyup.enter="dictionaryPageNum = 1; loadDictionary()"
        />
        <el-select v-model="dictionaryEnabled" clearable placeholder="启用状态">
          <el-option label="已启用" :value="true" />
          <el-option label="未启用" :value="false" />
        </el-select>
        <el-select v-model="dictionaryListingStatus" clearable placeholder="上市状态">
          <el-option label="正常上市" value="LISTED" />
          <el-option label="暂停上市" value="SUSPENDED" />
          <el-option label="已退市" value="DELISTED" />
          <el-option label="终止上市" value="TERMINATED" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="dictionaryPageNum = 1; loadDictionary()">查询</el-button>
        <el-button @click="resetDictionaryFilters">重置</el-button>
      </div>

      <div v-loading="dictionaryLoading" class="dictionary-list">
        <article v-for="item in dictionaryPage.list" :key="item.stockCode">
          <div class="dictionary-stock">
            <span class="stock-market">{{ item.market }}</span>
            <span><strong>{{ item.stockName }}</strong><small>{{ item.stockCode }}</small></span>
          </div>
          <div><small>上市状态</small><strong>{{ item.listingStatus }}</strong></div>
          <div><small>启用状态</small><strong :class="item.enabled ? 'tone-rise' : 'market-muted'">{{ item.enabled ? "已启用" : "未启用" }}</strong></div>
          <div><small>启用时间</small><strong>{{ formatDateTime(item.enabledAt) }}</strong></div>
          <div class="dictionary-actions">
            <template v-if="canManage && item.enabled">
              <el-button
                circle
                size="small"
                :icon="ArrowUp"
                aria-label="上移"
                :disabled="Boolean(dictionarySubmitting)"
                @click="reorder(item, 'UP')"
              />
              <el-button
                circle
                size="small"
                :icon="ArrowDown"
                aria-label="下移"
                :disabled="Boolean(dictionarySubmitting)"
                @click="reorder(item, 'DOWN')"
              />
            </template>
            <el-button
              v-if="canManage"
              size="small"
              :type="item.enabled ? 'danger' : 'primary'"
              plain
              :icon="Setting"
              :loading="dictionarySubmitting === item.stockCode"
              :disabled="Boolean(dictionarySubmitting) || (!item.enabled && monitorPage.enabledTotal >= ENABLE_LIMIT)"
              :title="!item.enabled && monitorPage.enabledTotal >= ENABLE_LIMIT ? '已达到10只上限，请先停用其他股票' : ''"
              @click="toggleStock(item)"
            >
              {{ item.enabled ? "停用" : "启用" }}
            </el-button>
          </div>
        </article>
        <div v-if="!dictionaryLoading && dictionaryPage.list.length === 0" class="dictionary-empty">
          没有匹配的股票字典记录
        </div>
      </div>
      <el-pagination
        v-model:current-page="dictionaryPageNum"
        background
        layout="prev, pager, next, total"
        :page-size="10"
        :total="dictionaryPage.total"
        class="dictionary-pagination"
      />
    </el-drawer>
  </div>
</template>

<style scoped>
.stock-monitor-page { display: grid; gap: 13px; }
.monitor-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.monitor-heading p { margin: 0 0 4px; color: #3b82f6; font-size: 9px; letter-spacing: .18em; }
.monitor-heading h1 { margin: 0; font-size: 20px; }
.monitor-heading__tools { display: flex; align-items: center; justify-content: flex-end; gap: 9px; color: #94a3b8; font-size: 11px; }
.quick-search { width: 290px; display: flex; gap: 5px; }
.quick-search button, .dictionary-button {
  min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 0 11px; color: #dbeafe; white-space: nowrap; border: 1px solid #2563eb;
  border-radius: 7px; background: rgba(37,99,235,.14); cursor: pointer;
}
.monitor-disclaimer { margin: 0; color: #5f718a; font-size: 10px; text-align: right; }
.stock-card-grid, .monitor-skeleton-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.stock-card { transition: border-color .18s, box-shadow .18s; }
.stock-card.is-highlighted { border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(59,130,246,.22); }
.stock-data-time { color: #718096; font-size: 9px; }
.stock-card__metrics {
  display: grid; grid-template-columns: 1.2fr repeat(5, 1fr); gap: 1px; overflow: hidden;
  margin-bottom: 7px; border: 1px solid #1a2b42; border-radius: 8px; background: #1a2b42;
}
.stock-card__metrics > div { min-width: 0; min-height: 58px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 8px; background: #091525; }
.stock-card__metrics small { color: #718096; font-size: 9px; }
.stock-card__metrics strong { overflow: hidden; text-overflow: ellipsis; font-size: 11px; white-space: nowrap; }
.stock-price { position: relative; }
.stock-price strong { font-size: 18px; }
.stock-price span { position: absolute; right: 8px; bottom: 9px; font-size: 9px; }
.stock-accessible-table { margin-top: 5px; color: #718096; font-size: 10px; }
.stock-accessible-table summary { min-height: 30px; display: flex; align-items: center; cursor: pointer; }
.stock-table-scroll { max-height: 180px; overflow: auto; }
.stock-accessible-table table { width: 100%; border-collapse: collapse; color: #94a3b8; }
.stock-accessible-table th, .stock-accessible-table td { padding: 6px; border-bottom: 1px solid #1a2b42; text-align: right; }
.stock-accessible-table th:first-child, .stock-accessible-table td:first-child { text-align: left; }
.stock-chart-empty { height: 270px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: #718096; font-size: 11px; }
.stock-chart-empty strong { color: #cbd5e1; font-size: 13px; }
.monitor-pagination { display: flex; justify-content: center; }
.monitor-error { margin: 0; padding: 9px 12px; color: #fecaca; border: 1px solid rgba(240,82,82,.3); border-radius: 8px; background: rgba(127,29,29,.16); font-size: 11px; }
.monitor-skeleton { min-height: 420px; border: 1px solid #20334d; border-radius: 12px; background: linear-gradient(100deg, #0b1728 30%, #102039 50%, #0b1728 70%); background-size: 240% 100%; animation: skeleton-move 1.4s linear infinite; }
@keyframes skeleton-move { to { background-position: -240% 0; } }
.dictionary-intro, .dictionary-filters { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dictionary-intro > div { display: flex; flex-direction: column; gap: 5px; }
.dictionary-intro span { color: #64748b; font-size: 12px; }
.dictionary-filters { margin: 18px 0 13px; justify-content: flex-start; }
.dictionary-filters .el-input { width: 210px; }
.dictionary-filters .el-select { width: 130px; }
.dictionary-list { min-height: 220px; display: grid; gap: 7px; }
.dictionary-list article {
  min-height: 66px; display: grid; grid-template-columns: 1.3fr .8fr .7fr 1fr auto;
  align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 9px;
}
.dictionary-list article > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dictionary-list small { color: #94a3b8; font-size: 10px; }
.dictionary-list strong { overflow: hidden; color: #334155; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.dictionary-stock { flex-direction: row !important; align-items: center; gap: 9px !important; }
.dictionary-stock > span:last-child { display: flex; flex-direction: column; gap: 3px; }
.stock-market { width: 30px; height: 30px; display: grid; place-items: center; color: #2563eb; border-radius: 7px; background: #eff6ff; font-size: 9px; font-weight: 700; }
.dictionary-actions { flex-direction: row !important; align-items: center; justify-content: flex-end; }
.dictionary-empty { min-height: 180px; display: grid; place-items: center; color: #94a3b8; }
.dictionary-pagination { justify-content: flex-end; margin-top: 15px; }
@media (max-width: 1023px) {
  .monitor-heading { align-items: flex-start; flex-direction: column; }
  .monitor-heading__tools { width: 100%; flex-wrap: wrap; justify-content: flex-start; }
  .stock-card-grid, .monitor-skeleton-grid { grid-template-columns: 1fr; }
}
@media (max-width: 767px) {
  .quick-search { width: 100%; order: 3; }
  .monitor-disclaimer { text-align: left; }
  .stock-card__metrics { grid-template-columns: repeat(2, 1fr); }
  .dictionary-filters { align-items: stretch; flex-direction: column; }
  .dictionary-filters .el-input, .dictionary-filters .el-select { width: 100%; }
  .dictionary-list article { grid-template-columns: 1fr 1fr; }
  .dictionary-actions { grid-column: 1 / -1; justify-content: flex-start; }
}
</style>
