<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { buildIntradayFundOption, buildSectorTreemapOption, buildCollectedPriceOption } from "@/charts/marketOptions";
import BaseChart from "@/components/market/BaseChart.vue";
import MarketPanel from "@/components/market/MarketPanel.vue";
import { useMarketSnapshotStream } from "@/composables/useMarketSnapshotStream";
import type { SnapshotCoreIndex, SnapshotModule, SnapshotSectorData, SnapshotSectorItem } from "@/types/market";
import { formatAmount, formatPercent, valueTone } from "@/utils/market";
import { sectorRankings, snapshotDateLabel, snapshotDelayLevel, snapshotGeneratedLabel,
  snapshotStatusLabel } from "@/utils/marketSnapshot";

type SectorKind = "industry" | "concept";
const kinds = [{ key: "industry", label: "行业" }, { key: "concept", label: "概念" }] as const;
const moduleNames = [
  { key: "coreIndices", label: "核心指数", source: "AKShare / 新浪" },
  { key: "industrySectors", label: "行业板块", source: "AKShare / THS" },
  { key: "conceptSectors", label: "概念板块", source: "AKShare / THS" },
  { key: "marketFundFlow", label: "大盘资金流", source: "AKShare / THS_INDIVIDUAL_AGGREGATE" },
] as const;
const coreIndexRoles = [
  { code: "sh000001", name: "上证指数", role: "沪市整体温度" },
  { code: "sz399001", name: "深证成指", role: "深市整体温度" },
  { code: "sh000300", name: "沪深300", role: "核心大盘权重" },
  { code: "sz399006", name: "创业板指", role: "成长风险偏好" },
  { code: "sh000688", name: "科创50", role: "科技与科创风格" },
] as const;

const { snapshot, loading, loadError, manualRefresh } = useMarketSnapshotStream();
const sectorKind = ref<SectorKind>("industry");
const flowKind = ref<SectorKind>("industry");
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 30_000); });
onBeforeUnmount(() => { if (clock) clearInterval(clock); });

function sectorModule(kind: SectorKind): SnapshotModule<SnapshotSectorData> | null {
  return snapshot.value?.modules[kind === "industry" ? "industrySectors" : "conceptSectors"] ?? null;
}

function moduleForStatus(key: typeof moduleNames[number]["key"]): SnapshotModule<unknown> | null {
  return snapshot.value?.modules[key] ?? null;
}

function shanghaiTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

function formatYuan(value: number | null | undefined): string {
  return value == null ? "—" : `${formatAmount(value)}元`;
}

function formatMarketYuan(value: number | null | undefined): string {
  if (value == null) return "—";
  if (Math.abs(value) < 100_000_000) return formatYuan(value);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${(Math.abs(value) / 100_000_000).toLocaleString("zh-CN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}亿元`;
}

function formatCount(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("zh-CN");
}

const coreIndices = computed(() => snapshot.value?.modules.coreIndices?.data?.items ?? []);
function indexRole(code: string): string { return coreIndexRoles.find((item) => item.code === code.toLowerCase())?.role ?? "核心指数"; }

function indexOption(item: SnapshotCoreIndex) {
  return buildCollectedPriceOption(item.series, "点");
}

const sectorData = computed(() => sectorModule(sectorKind.value)?.data);
const flowData = computed(() => sectorModule(flowKind.value)?.data);
const sectorRanks = computed(() => sectorRankings(sectorData.value?.items ?? []));
const flowRanks = computed(() => sectorRankings(flowData.value?.items ?? []));
const treemapItems = computed(() => (sectorData.value?.items ?? [])
  .filter((item) => item.companyCount !== null && item.companyCount > 0));
const treemapOption = computed(() => buildSectorTreemapOption(
  sectorData.value?.items ?? [], sectorModule(sectorKind.value)?.lastSuccessAt ?? null,
));
const fundModule = computed(() => snapshot.value?.modules.marketFundFlow ?? null);
const fundOption = computed(() => buildIntradayFundOption(fundModule.value?.data?.series ?? []));
const breadth = computed(() => fundModule.value?.data?.latest ?? null);
const breadthMismatch = computed(() => {
  const value = breadth.value;
  return value && [value.riseCount, value.fallCount, value.flatCount, value.stockCount].every((count) => count !== null)
    ? value.riseCount! + value.fallCount! + value.flatCount! !== value.stockCount : false;
});

function barWidth(item: SnapshotSectorItem, items: SnapshotSectorItem[]): string {
  const maximum = Math.max(...items.map((row) => Math.abs(row.netAmount ?? 0)), 0);
  return maximum > 0 ? `${Math.max(5, Math.abs(item.netAmount ?? 0) / maximum * 100)}%` : "0%";
}
</script>

<template>
  <div class="snapshot-dashboard">
    <header class="snapshot-intro">
      <div>
        <p class="snapshot-kicker">AKSHARE · MARKET SNAPSHOT V1</p>
        <h1>市场与资金总览</h1>
        <div class="snapshot-summary" :class="{ 'has-error': loadError }">
          <p :aria-hidden="!!loadError">核心指数、全市场资金与板块行情；请以各模块标注的数据日期和采集时间判断时效。</p>
          <p class="snapshot-connection-status" :class="{ 'has-error': loadError }" :role="loadError ? 'alert' : 'status'" :tabindex="loadError ? 0 : -1">
            <template v-if="loadError">{{ snapshot ? "读取失败，仍显示上次取得的快照，更新可能延迟。" : "快照暂不可用。" }} {{ loadError }}</template>
          </p>
        </div>
      </div>
      <div class="snapshot-intro__actions">
        <span>{{ snapshotGeneratedLabel(snapshot) }}</span>
        <button type="button" :disabled="loading" @click="manualRefresh">
          <Refresh class="snapshot-refresh-icon" :class="{ 'is-spinning': loading }" />重新读取快照
        </button>
      </div>
    </header>

    <p v-if="!snapshot && !loading" class="snapshot-empty">暂无市场快照。请等待采集或重新读取。</p>

    <section class="snapshot-section" aria-labelledby="indices-title">
      <div class="snapshot-section__heading"><div><p class="snapshot-kicker">01 / CORE INDICES</p><h2 id="indices-title">核心指数</h2></div></div>
      <p class="snapshot-note">新浪行情经 AKShare 采集；源站未提供可靠时间，曲线横轴为实际采集时间。</p>
      <div class="snapshot-index-grid">
        <article v-for="entry in coreIndices" :key="entry.code" class="snapshot-index-card">
          <header><div><h3>{{ entry.name }}</h3><small>{{ entry.code }} · {{ indexRole(entry.code) }}</small></div><span>已采集</span></header>
          <strong class="snapshot-index-price" :class="`tone-${valueTone(entry.changePercent)}`">{{ formatCount(entry.price) }}</strong>
          <p><span :class="`tone-${valueTone(entry.change)}`">{{ formatCount(entry.change) }}</span> · <span :class="`tone-${valueTone(entry.changePercent)}`">{{ formatPercent(entry.changePercent) }}</span></p>
          <dl><div><dt>成交额</dt><dd>{{ formatYuan(entry.amount) }}</dd></div><div><dt>有效交易日</dt><dd>{{ snapshot?.modules.coreIndices?.tradeDate || '—' }}</dd></div><div><dt>采集时间</dt><dd>{{ shanghaiTime(entry.collectedAt) }}</dd></div></dl>
          <BaseChart v-if="entry.series.length" :option="indexOption(entry)" :accessible-label="`${entry.name}实际采集时间价格走势`" height="90px" />
          <p v-else class="snapshot-index-empty">暂无实际采样走势</p>
        </article>
      </div>
      <p v-if="!coreIndices.length" class="snapshot-empty">暂无已启用且有有效行情的核心指数。</p>
    </section>

    <div class="snapshot-module-status-grid" aria-label="采集模块状态">
      <div
        v-for="entry in moduleNames" :key="entry.key" class="snapshot-module-status"
        :class="[`is-${(moduleForStatus(entry.key)?.status ?? 'ERROR').toLowerCase()}`,
                 `is-${snapshotDelayLevel(moduleForStatus(entry.key), now)}`]"
      >
        <strong>{{ entry.label }}</strong>
        <span>{{ entry.source }}</span>
        <span>{{ snapshotDateLabel(moduleForStatus(entry.key)) }}</span>
        <span>采集时间 {{ shanghaiTime(moduleForStatus(entry.key)?.lastSuccessAt) }}</span>
        <b>{{ moduleForStatus(entry.key)?.status ?? "ERROR" }} · {{ snapshotStatusLabel(moduleForStatus(entry.key)) }}</b>
        <b class="snapshot-delay-line">{{ snapshotDelayLevel(moduleForStatus(entry.key), now) === "severe" ? "采集显著延迟超过 300 秒" : snapshotDelayLevel(moduleForStatus(entry.key), now) === "delayed" ? "采集延迟超过 120 秒" : "" }}</b>
        <span class="snapshot-module-message">{{ moduleForStatus(entry.key)?.message || "" }}</span>
      </div>
    </div>

    <section class="snapshot-section" aria-labelledby="market-flow-title">
      <div class="snapshot-section__heading"><div><p class="snapshot-kicker">02 / MARKET FLOW</p><h2 id="market-flow-title">大盘资金流</h2></div></div>
      <MarketPanel
        title="全市场个股资金汇总" :status="fundModule?.status ?? 'ERROR'"
        :loading="loading && !snapshot" :has-data="Boolean(fundModule?.data?.latest)"
        :message="fundModule?.message ?? loadError"
      >
        <p class="snapshot-note">由同花顺即时个股资金数据汇总；日内曲线仅连接连续成功采样，午间及采集缺口断线。</p>
        <p v-if="fundModule?.data?.reconciledFromLegacy" class="snapshot-note" role="status">历史快照已按统一口径校正：净额 = 同批流入 − 流出。</p>
        <div class="snapshot-market-metrics">
          <div><small>全市场净额</small><strong :class="`tone-${valueTone(fundModule?.data?.latest.netAmount)}`">{{ formatMarketYuan(fundModule?.data?.latest.netAmount) }}</strong></div>
          <div><small>流入</small><strong>{{ formatMarketYuan(fundModule?.data?.latest.inflow) }}</strong></div>
          <div><small>流出</small><strong>{{ formatMarketYuan(fundModule?.data?.latest.outflow) }}</strong></div>
        </div>
        <p class="snapshot-note">最近采集：{{ shanghaiTime(fundModule?.data?.latest.collectedAt) }}。这不是源站报价时间。</p>
        <BaseChart
          v-if="fundModule?.data?.series.length" :option="fundOption"
          :accessible-label="`全市场资金净额当日日内曲线，共 ${fundModule.data.series.length} 个实际采样点`" height="300px"
        />
        <p v-else class="snapshot-no-rank">暂无当日有效资金采样点</p>
        <details v-if="fundModule?.data?.series.length" class="snapshot-accessible-table">
          <summary>查看实际采样数据表</summary>
          <div>
            <table>
              <thead><tr><th>采集时间</th><th>流入 · 元</th><th>流出 · 元</th><th>净额 · 元</th></tr></thead>
              <tbody>
                <tr v-for="point in fundModule.data.series" :key="point.collectedAt">
                  <td>{{ shanghaiTime(point.collectedAt) }}</td><td>{{ formatYuan(point.inflow) }}</td>
                  <td>{{ formatYuan(point.outflow) }}</td><td>{{ formatYuan(point.netAmount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </MarketPanel>
    </section>

    <section class="snapshot-section" aria-labelledby="breadth-title">
      <div class="snapshot-section__heading"><div><p class="snapshot-kicker">03 / MARKET BREADTH</p><h2 id="breadth-title">市场宽度</h2></div></div>
      <div class="snapshot-market-metrics snapshot-breadth-metrics">
        <div><small>上涨</small><strong class="tone-rise">{{ formatCount(breadth?.riseCount) }}</strong></div>
        <div><small>下跌</small><strong class="tone-fall">{{ formatCount(breadth?.fallCount) }}</strong></div>
        <div><small>平盘</small><strong>{{ formatCount(breadth?.flatCount) }}</strong></div>
        <div><small>样本股票数</small><strong>{{ formatCount(breadth?.stockCount) }}</strong></div>
      </div>
      <p v-if="breadthMismatch" class="snapshot-alert" role="alert">宽度数据质量异常：上涨、下跌、平盘之和与样本数不一致。</p>
      <p v-else class="snapshot-note">宽度与全市场资金流来自同一批次的个股样本。</p>
    </section>

    <section class="snapshot-section" aria-labelledby="sector-title">
      <div class="snapshot-section__heading"><div><p class="snapshot-kicker">04 / SECTOR MARKET</p><h2 id="sector-title">板块行情</h2></div></div>
      <MarketPanel
        title="板块热力图与涨跌榜" :status="sectorModule(sectorKind)?.status ?? 'ERROR'"
        :loading="loading && !snapshot" :has-data="Boolean(sectorData)"
        :message="sectorModule(sectorKind)?.message ?? loadError"
      >
        <div class="snapshot-tabs" role="tablist" aria-label="板块行情类别">
          <button
            v-for="kind in kinds" :key="kind.key" type="button" role="tab"
            :aria-selected="sectorKind === kind.key" :class="{ 'is-active': sectorKind === kind.key }"
            @click="sectorKind = kind.key"
          >
            {{ kind.label }}
          </button>
        </div>
        <p class="snapshot-note">面积按有效企业数，红色上涨、绿色下跌；无有效企业数的板块不进入热力图。</p>
        <div class="snapshot-sector-layout">
          <div class="snapshot-treemap">
            <BaseChart
              v-if="treemapItems.length" :option="treemapOption"
              :accessible-label="`${sectorKind === 'industry' ? '行业' : '概念'}板块热力图，面积为企业数，颜色为涨跌方向`" height="320px"
            />
            <p v-else class="snapshot-no-rank">暂无可用于面积映射的企业数</p>
          </div>
          <div class="snapshot-ranking-columns">
            <div
              v-for="ranking in [{ key: 'topRise', label: '涨幅 Top 10' }, { key: 'topFall', label: '跌幅 Top 10' }] as const"
              :key="ranking.key" class="snapshot-ranking"
            >
              <h3>{{ ranking.label }}</h3>
              <ol v-if="sectorRanks[ranking.key].length">
                <li v-for="item in sectorRanks[ranking.key]" :key="`${item.type}:${item.name}`">
                  <span>{{ item.name }}</span><strong :class="`tone-${valueTone(item.changePct)}`">{{ formatPercent(item.changePct) }}</strong>
                </li>
              </ol>
              <p v-else class="snapshot-no-rank">暂无符合方向的数据</p>
            </div>
          </div>
        </div>
      </MarketPanel>
    </section>

    <section class="snapshot-section" aria-labelledby="sector-flow-title">
      <div class="snapshot-section__heading"><div><p class="snapshot-kicker">05 / SECTOR FLOW</p><h2 id="sector-flow-title">板块资金流</h2></div></div>
      <MarketPanel
        title="板块净额排行" :status="sectorModule(flowKind)?.status ?? 'ERROR'"
        :loading="loading && !snapshot" :has-data="Boolean(flowData)"
        :message="sectorModule(flowKind)?.message ?? loadError"
      >
        <div class="snapshot-tabs" role="tablist" aria-label="板块资金流类别">
          <button
            v-for="kind in kinds" :key="kind.key" type="button" role="tab"
            :aria-selected="flowKind === kind.key" :class="{ 'is-active': flowKind === kind.key }"
            @click="flowKind = kind.key"
          >
            {{ kind.label }}
          </button>
        </div>
        <p class="snapshot-note">净额单位为元；资金流强度 = 净额 /（流入 + 流出），独立于涨跌幅。</p>
        <div class="snapshot-flow-columns">
          <div
            v-for="ranking in [{ key: 'topInflow', label: '净流入 Top 10' }, { key: 'topOutflow', label: '净流出 Top 10' }] as const"
            :key="ranking.key" class="snapshot-flow-list"
          >
            <h3>{{ ranking.label }}</h3>
            <ol v-if="flowRanks[ranking.key].length">
              <li v-for="item in flowRanks[ranking.key]" :key="`${item.type}:${item.name}`">
                <div class="snapshot-flow-row"><span>{{ item.name }}</span><strong :class="`tone-${valueTone(item.netAmount)}`">{{ formatYuan(item.netAmount) }}</strong></div>
                <div class="snapshot-flow-track"><i :class="`tone-${valueTone(item.netAmount)}`" :style="{ width: barWidth(item, flowRanks[ranking.key]) }" /></div>
                <small>资金流强度 {{ formatPercent(item.netFlowRate) }} · <span :class="`tone-${valueTone(item.changePct)}`">涨跌幅 {{ formatPercent(item.changePct) }}</span></small>
              </li>
            </ol>
            <p v-else class="snapshot-no-rank">暂无符合方向的数据</p>
          </div>
        </div>
      </MarketPanel>
    </section>
  </div>
</template>

<style scoped>
.snapshot-summary { position: relative; }
.snapshot-summary.has-error > p:first-child { visibility: hidden; }
.snapshot-intro .snapshot-connection-status { position: absolute; inset: 0; overflow: auto; overflow-wrap: anywhere; color: #ffb4b4; background: var(--market-panel); border-radius: 4px; }
.snapshot-connection-status:not(.has-error) { visibility: hidden; }
.snapshot-module-status { grid-template-rows: repeat(6, minmax(18px, auto)) 36px; }
.snapshot-delay-line { min-height: 18px; }
.snapshot-module-message { height: 36px; overflow: auto; }
.snapshot-dashboard { display: grid; gap: 16px; }
.snapshot-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 14px 2px 4px; }
.snapshot-kicker { margin: 0 0 5px; color: var(--market-primary); font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.snapshot-intro h1 { margin: 0 0 8px; font-size: clamp(22px, 2.4vw, 30px); }
.snapshot-intro p:not(.snapshot-kicker) { margin: 0; color: var(--market-muted); font-size: 13px; line-height: 1.6; }
.snapshot-intro__actions { display: grid; justify-items: end; gap: 8px; color: var(--market-muted); font-size: 12px; }
.snapshot-intro__actions button { min-height: 44px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; color: var(--market-text); border: 1px solid var(--market-border); border-radius: 8px; background: var(--market-surface); cursor: pointer; }
.snapshot-intro__actions button:disabled { opacity: .55; cursor: wait; }
.snapshot-refresh-icon { width: 15px; height: 15px; }
.snapshot-alert, .snapshot-empty { margin: 0; padding: 12px 16px; border: 1px solid var(--market-border); border-radius: 8px; color: var(--market-muted); background: var(--market-panel); font-size: 13px; }
.snapshot-alert { color: #ffb4b4; border-color: rgb(247 101 101 / 38%); }
.snapshot-module-status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.snapshot-module-status { min-width: 0; display: grid; gap: 4px; padding: 12px; border: 1px solid var(--market-border); border-radius: 10px; background: var(--market-panel); font-size: 11px; }
.snapshot-module-status strong { color: var(--market-text); font-size: 13px; }
.snapshot-module-status span { color: var(--market-muted); overflow-wrap: anywhere; }
.snapshot-module-status b { color: var(--market-text-secondary); font-weight: 600; }
.snapshot-module-status.is-stale b, .snapshot-module-status.is-delayed b { color: var(--market-warning); }
.snapshot-module-status.is-error b, .snapshot-module-status.is-severe b { color: var(--market-rise); }
.snapshot-module-status.is-severe { border-color: var(--market-rise); background: rgb(247 101 101 / 9%); }
.snapshot-section { min-width: 0; display: grid; gap: 10px; }
.snapshot-index-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.snapshot-index-card { min-width: 0; padding: 12px; border: 1px solid var(--market-border); border-radius: 10px; background: var(--market-panel); }
.snapshot-index-card header { display: flex; justify-content: space-between; gap: 6px; }
.snapshot-index-card h3 { margin: 0 0 3px; font-size: 14px; }
.snapshot-index-card small, .snapshot-index-card header span, .snapshot-index-card dt { color: var(--market-muted); font-size: 11px; }
.snapshot-index-card header span { flex: none; }
.snapshot-index-price { display: block; margin-top: 10px; font-size: 21px; }
.snapshot-index-card p { margin: 4px 0 8px; font-size: 12px; }
.snapshot-index-card dl { display: grid; gap: 3px; margin: 0; }
.snapshot-index-card dl div { display: flex; justify-content: space-between; gap: 5px; font-size: 11px; }
.snapshot-index-card dd { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snapshot-index-card .snapshot-index-empty { display: grid; place-items: center; min-height: 90px; color: var(--market-muted); }
.snapshot-section__heading h2 { margin: 0; font-size: 18px; }
.snapshot-tabs { display: inline-flex; gap: 4px; margin-bottom: 10px; padding: 3px; border: 1px solid var(--market-border); border-radius: 8px; }
.snapshot-tabs button { min-height: 38px; padding: 0 16px; color: var(--market-muted); border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.snapshot-tabs button.is-active { color: #fff; background: var(--market-primary); }
.snapshot-note { margin: 4px 0 12px; color: var(--market-muted); font-size: 12px; line-height: 1.5; }
.snapshot-sector-layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 12px; }
.snapshot-treemap { min-height: 320px; border: 1px solid var(--market-border-soft); border-radius: 8px; overflow: visible; }
.snapshot-ranking-columns, .snapshot-flow-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.snapshot-ranking, .snapshot-flow-list { min-width: 0; padding: 12px; border: 1px solid var(--market-border-soft); border-radius: 8px; background: var(--market-surface); }
.snapshot-ranking h3, .snapshot-flow-list h3 { margin: 0 0 8px; font-size: 13px; }
.snapshot-ranking ol, .snapshot-flow-list ol { margin: 0; padding-left: 20px; }
.snapshot-ranking li { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; color: var(--market-muted); font-size: 12px; }
.snapshot-ranking li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snapshot-ranking li strong, .snapshot-flow-row strong { flex: none; }
.snapshot-no-rank { margin: 10px; color: var(--market-subtle); font-size: 12px; }
.snapshot-flow-list li { padding: 7px 0; color: var(--market-muted); font-size: 12px; }
.snapshot-flow-row { display: flex; justify-content: space-between; gap: 8px; }
.snapshot-flow-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snapshot-flow-track { height: 5px; margin: 5px 0; border-radius: 9px; background: var(--market-border); }
.snapshot-flow-track i { display: block; height: 100%; border-radius: inherit; background: var(--market-muted); }
.snapshot-flow-track i.tone-rise { background: var(--market-rise); }
.snapshot-flow-track i.tone-fall { background: var(--market-fall); }
.snapshot-flow-list small { color: var(--market-subtle); }
.snapshot-market-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }
.snapshot-breadth-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; }
.snapshot-market-metrics > div { display: grid; gap: 5px; min-width: 0; padding: 12px; border: 1px solid var(--market-border-soft); border-radius: 8px; background: var(--market-surface); }
.snapshot-market-metrics small { color: var(--market-muted); font-size: 12px; }
.snapshot-market-metrics strong { overflow-wrap: anywhere; font-size: 16px; }
.snapshot-accessible-table { margin-top: 10px; color: var(--market-muted); font-size: 12px; }
.snapshot-accessible-table summary { min-height: 36px; cursor: pointer; }
.snapshot-accessible-table > div { overflow-x: auto; }
.snapshot-accessible-table table { width: 100%; min-width: 540px; border-collapse: collapse; }
.snapshot-accessible-table th, .snapshot-accessible-table td { padding: 7px; border-bottom: 1px solid var(--market-border); text-align: left; }
@media (max-width: 1100px) { .snapshot-index-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .snapshot-module-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .snapshot-sector-layout { grid-template-columns: 1fr; } }
@media (max-width: 767px) { .snapshot-intro { align-items: flex-start; flex-direction: column; } .snapshot-intro__actions { justify-items: start; } .snapshot-module-status-grid, .snapshot-ranking-columns, .snapshot-flow-columns { grid-template-columns: 1fr; } .snapshot-index-grid, .snapshot-market-metrics, .snapshot-breadth-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 420px) { .snapshot-index-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .snapshot-intro__actions button { transition: none; } }
</style>
