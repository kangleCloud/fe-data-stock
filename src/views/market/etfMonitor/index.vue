<script setup lang="ts">
import { Refresh, Search, Setting } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { buildCollectedPriceOption } from "@/charts/marketOptions";
import BaseChart from "@/components/market/BaseChart.vue";
import { useEtfMonitorStream } from "@/composables/useEtfMonitorStream";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { canAccess } from "@/utils/permission";
import type { EtfMonitorItem } from "@/types/etf";
import { formatAmount, formatPercent, formatPlainNumber, valueTone } from "@/utils/market";
import { etfProfileStatus } from "@/utils/etfProfile";
import { etfAllocationMessage } from "@/utils/etfMonitor";
import { shanghaiToday } from "@/utils/stockMonitor";

const PAGE_SIZE = 4;
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const permissions = usePermissionStore();
const configOpening = ref(false);
const canViewConfig = computed(() => auth.isAuthenticated && permissions.initialized &&
  canAccess(auth.permissionCodes, "system:etf-monitor:view"));

async function initializePermissions(): Promise<void> {
  if (!auth.isAuthenticated || permissions.initialized) return;
  try { await permissions.initialize(router); }
  catch { /* 公开快照继续可读，权限未加载时隐藏配置入口。 */ }
}

async function openConfig(): Promise<void> {
  if (!canViewConfig.value || configOpening.value) return;
  configOpening.value = true;
  try {
    await permissions.initialize(router);
    await router.push("/system/etfMonitor");
  } catch { ElMessage.error("配置页面暂不可用，请稍后重试"); }
  finally { configOpening.value = false; }
}

onMounted(initializePermissions);
watch(() => auth.isAuthenticated, initializePermissions);
const { snapshot: dashboard, loading, loadError, manualRefresh } = useEtfMonitorStream();
const page = ref(1);
const keyword = ref("");
const etfs = computed(() => dashboard.value?.etfs ?? []);
const pages = computed(() => Math.max(1, Math.ceil(etfs.value.length / PAGE_SIZE)));
const visible = computed(() => etfs.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
let initialSymbol = typeof route.query.symbol === "string" ? route.query.symbol : null;
watch(etfs, () => {
  page.value = Math.min(page.value, pages.value);
  if (initialSymbol && etfs.value.length) {
    keyword.value = initialSymbol;
    initialSymbol = null;
    locate();
  }
});

function shanghaiTime(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

function statusLabel(item: EtfMonitorItem): string {
  if (item.dataStatus === "NO_DATA") return "暂无有效行情";
  if (item.dataStatus === "HISTORICAL" || item.effectiveTradeDate && item.effectiveTradeDate !== shanghaiToday()) {
    return `历史行情 · ${item.effectiveTradeDate}`;
  }
  if (item.dataStatus === "DELAYED" || item.quote?.status === "STALE") return "采样已延迟";
  return item.closeConfirmed ? "已确认收盘" : "当日采样 · 收盘未确认";
}

function locate(): void {
  const term = keyword.value.trim().toUpperCase();
  if (!term) return;
  const index = etfs.value.findIndex((item) => item.symbol.includes(term) || item.code.includes(term) || item.name.includes(term));
  if (index < 0) { ElMessage.warning("未在已启用 ETF 中找到匹配项"); return; }
  page.value = Math.floor(index / PAGE_SIZE) + 1;
}

function priceOption(item: EtfMonitorItem) {
  return buildCollectedPriceOption(item.series);
}
</script>

<template>
  <div class="etf-monitor-page">
    <header class="etf-heading">
      <div><p>ETF MONITOR · V1</p><h1>ETF 监控</h1><span>独立监控最多 10 只 ETF；行情来自 AKShare / 新浪</span></div>
      <div class="etf-tools">
        <span>{{ etfs.length }} / 10 只</span>
        <el-input v-model="keyword" clearable placeholder="ETF 代码或名称" :prefix-icon="Search" @keyup.enter="locate" />
        <button type="button" @click="locate">定位</button>
        <button type="button" :disabled="loading" @click="manualRefresh"><Refresh />重新读取快照</button>
        <button v-if="canViewConfig" type="button" :disabled="configOpening" @click="openConfig"><Setting />配置管理</button>
      </div>
    </header>
    <p class="etf-notice">行情无可靠源时间，价格曲线横轴和卡片时间均为实际采集时间；历史行情不代表已确认收盘。</p>
    <p v-if="dashboard && !dashboard.xqEnabled" class="etf-notice">雪球资料采集关闭，资产配置不公开；新浪 ETF 行情仍可查看。</p>
    <p class="etf-error stream-status-slot" :class="{ 'has-error': loadError }" role="alert"><template v-if="loadError">{{ dashboard ? "保留上次快照，更新可能延迟：" : "ETF 快照不可用：" }}{{ loadError }}</template></p>
    <div v-if="loading && !dashboard" class="etf-empty">正在读取 ETF 快照…</div>
    <div v-else-if="!etfs.length" class="etf-empty"><span>{{ dashboard ? "尚未启用 ETF 监控" : "暂无 ETF 监控快照" }}</span><el-button v-if="canViewConfig" :icon="Setting" :loading="configOpening" @click="openConfig">配置管理</el-button></div>
    <div v-else class="etf-grid">
      <section v-for="item in visible" :key="item.symbol" class="etf-card">
        <header class="etf-card-heading">
          <div><h2>{{ item.name }} <small>{{ item.symbol }}</small></h2><span>{{ item.profile.fundType || "—" }} · {{ item.profile.exchange || item.market }}</span></div>
          <div><strong>{{ statusLabel(item) }}</strong><small>有效交易日 {{ item.effectiveTradeDate || "—" }}</small></div>
        </header>
        <dl class="etf-metrics">
          <div><dt>交易价格 · 元</dt><dd>{{ formatPlainNumber(item.quote?.price ?? null) }}</dd></div>
          <div><dt>涨跌额 · 元</dt><dd :class="`tone-${valueTone(item.quote?.change)}`">{{ formatPlainNumber(item.quote?.change ?? null) }}</dd></div>
          <div><dt>涨跌幅</dt><dd :class="`tone-${valueTone(item.quote?.changePercent)}`">{{ formatPercent(item.quote?.changePercent ?? null) }}</dd></div>
          <div><dt>成交额 · 元</dt><dd>{{ formatAmount(item.quote?.amount ?? null) }}</dd></div>
          <div><dt>成交量</dt><dd>{{ formatPlainNumber(item.quote?.volume ?? null) }}</dd></div>
          <div><dt>跟踪指数</dt><dd>{{ item.profile.trackingIndexName || "暂无可靠数据" }}<small v-if="item.profile.trackingIndexCode"> {{ item.profile.trackingIndexCode }}</small></dd></div>
          <div><dt>管理人</dt><dd>{{ item.profile.manager || "—" }}</dd></div>
          <div><dt>采集时间</dt><dd>{{ shanghaiTime(item.quote?.collectedAt ?? null) }}</dd></div>
        </dl>
        <div class="etf-section">
          <h3>日内交易价格 <small>实际采集时间 · {{ item.effectiveTradeDate || "—" }}</small></h3>
          <BaseChart v-if="item.series.length" :option="priceOption(item)" :accessible-label="`${item.name}实际采集时间价格走势，共 ${item.series.length} 点`" height="190px" />
          <p v-else>暂无实际价格采样点</p>
          <details v-if="item.series.length"><summary>查看价格采样表</summary><div class="etf-table-scroll"><table><thead><tr><th>采集时间</th><th>交易价格 · 元</th></tr></thead><tbody><tr v-for="point in item.series" :key="point.collectedAt"><td>{{ shanghaiTime(point.collectedAt) }}</td><td>{{ formatPlainNumber(point.price) }}</td></tr></tbody></table></div></details>
        </div>
        <div class="etf-section"><h3>ETF 资金净流入走势</h3><p>资金流暂未支持，暂无可靠非东财来源。</p></div>
        <div class="etf-section">
          <h3>资产配置 <small>类别占比，不是成分股持仓</small></h3>
          <p class="etf-allocation-status" role="status">{{ etfAllocationMessage(item) }}</p>
          <template v-if="item.assetAllocation && item.assetAllocationStatus !== 'DISABLED'">
            <p>请求报告期 {{ item.assetAllocation.requestedReportPeriod }} · 来源 雪球基金 · 采集 {{ shanghaiTime(item.assetAllocation.collectedAt) }}</p>
            <div class="etf-table-scroll"><table><thead><tr><th>资产类别</th><th>占比</th></tr></thead><tbody><tr v-for="category in item.assetAllocation.categories" :key="category.category"><td>{{ category.category }}</td><td>{{ formatPercent(category.percent) }}</td></tr></tbody></table></div>
          </template>
        </div>
        <footer>行情来源 AKShare / 新浪 · {{ etfProfileStatus(item.profile) }} · 资料采集 {{ shanghaiTime(item.profile.updatedAt) }} · {{ item.closeConfirmed ? "收盘已确认" : "收盘未确认" }}</footer>
      </section>
    </div>
    <el-pagination v-if="etfs.length > PAGE_SIZE" v-model:current-page="page" class="etf-pagination" background layout="prev, pager, next" :page-size="PAGE_SIZE" :total="etfs.length" />
  </div>
</template>

<style scoped>
.etf-allocation-status { height: 40px; overflow: auto; }
.stream-status-slot { height: 56px; box-sizing: border-box; overflow: auto; }
.stream-status-slot:not(.has-error) { visibility: hidden; }
.etf-monitor-page { display: grid; gap: 14px; color: var(--market-text); }
.etf-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.etf-heading p { margin: 0 0 4px; color: var(--market-primary); font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.etf-heading h1 { margin: 0 0 3px; font-size: 25px; }
.etf-heading span, .etf-tools { color: var(--market-muted); font-size: 12px; }
.etf-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.etf-tools .el-input { width: 190px; }
.etf-tools button { min-height: 40px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; color: #dbeafe; border: 1px solid var(--market-primary); border-radius: 8px; background: rgb(59 130 246 / 14%); cursor: pointer; }
.etf-tools button:disabled { opacity: .55; cursor: wait; }
.etf-tools svg { width: 15px; height: 15px; }
.etf-notice, .etf-error { margin: 0; padding: 10px 13px; color: var(--market-muted); border: 1px solid var(--market-border); border-radius: 8px; background: var(--market-panel); font-size: 12px; }
.etf-error { color: #fecaca; border-color: rgb(240 82 82 / 45%); }
.etf-empty { display: grid; place-items: center; min-height: 250px; border: 1px solid var(--market-border); border-radius: 10px; background: var(--market-panel); color: var(--market-muted); }
.etf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.etf-card { min-width: 0; padding: 15px; border: 1px solid var(--market-border); border-radius: 12px; background: var(--market-panel); }
.etf-card-heading { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.etf-card-heading h2 { margin: 0 0 4px; font-size: 16px; }
.etf-card-heading small, .etf-card-heading span, .etf-card-heading > div:last-child { color: var(--market-muted); font-size: 11px; }
.etf-card-heading > div:last-child { display: grid; gap: 3px; text-align: right; }
.etf-card-heading strong { color: #fcd34d; }
.etf-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; margin: 0; border: 1px solid var(--market-border); border-radius: 8px; background: var(--market-border); }
.etf-metrics > div { display: grid; gap: 5px; min-width: 0; padding: 10px; background: #091423; }
.etf-metrics dt { color: var(--market-muted); font-size: 11px; }
.etf-metrics dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 13px; }
.etf-metrics dd small { color: var(--market-muted); font-size: 10px; }
.etf-section { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--market-border); }
.etf-section h3 { margin: 0 0 7px; color: var(--market-text-secondary); font-size: 13px; }
.etf-section h3 small, .etf-section p { color: var(--market-muted); font-size: 11px; font-weight: 400; }
.etf-section p { margin: 8px 0; line-height: 1.5; }
.etf-section details { color: var(--market-muted); font-size: 11px; }
.etf-section summary { min-height: 32px; cursor: pointer; }
.etf-table-scroll { max-height: 180px; overflow: auto; }
.etf-section table { width: 100%; border-collapse: collapse; font-size: 11px; }
.etf-section th, .etf-section td { padding: 6px; border-bottom: 1px solid var(--market-border); text-align: left; }
.etf-card footer { margin-top: 10px; color: var(--market-muted); font-size: 11px; }
.etf-pagination { display: flex; justify-content: center; }
@media (max-width: 900px) { .etf-grid { grid-template-columns: 1fr; } .etf-heading { align-items: flex-start; flex-direction: column; } }
@media (max-width: 600px) { .etf-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .etf-tools { justify-content: flex-start; } .etf-tools .el-input { width: 100%; } .etf-card-heading { flex-wrap: wrap; } }
</style>
