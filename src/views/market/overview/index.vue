<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { computed, ref } from "vue";

import { buildMarketFundOption } from "@/charts/marketOptions";
import BaseChart from "@/components/market/BaseChart.vue";
import MarketPanel from "@/components/market/MarketPanel.vue";
import { useMarketSnapshotStream } from "@/composables/useMarketSnapshotStream";
import type {
  FundType,
  SnapshotModule,
  SnapshotRankingItem,
  SnapshotTop5,
} from "@/types/market";
import { formatAmount, formatDateTime, formatPercent, formatPlainNumber, valueTone } from "@/utils/market";
import {
  snapshotDateLabel,
  snapshotGeneratedLabel,
  snapshotStatusLabel,
  toChartPoint,
} from "@/utils/marketSnapshot";

type SectorKey = "industry" | "concept";
type RankingKey = "topRise" | "topFall" | "topInflow" | "topOutflow";

const sectorKinds = [
  { key: "industry", label: "行业板块" },
  { key: "concept", label: "概念板块" },
] as const;
const rankingKinds = [
  { key: "topRise", label: "涨幅 Top 5", unit: "change" },
  { key: "topFall", label: "跌幅 Top 5", unit: "change" },
  { key: "topInflow", label: "同花顺资金净额流入 Top 5", unit: "flow" },
  { key: "topOutflow", label: "同花顺资金净额流出 Top 5", unit: "flow" },
] as const;
const fundMetrics = [
  { key: "mainNetInflow", ratio: "mainNetInflowRatio", label: "主力" },
  { key: "superLargeNetInflow", ratio: "superLargeNetInflowRatio", label: "超大单" },
  { key: "largeNetInflow", ratio: "largeNetInflowRatio", label: "大单" },
  { key: "mediumNetInflow", ratio: "mediumNetInflowRatio", label: "中单" },
  { key: "smallNetInflow", ratio: "smallNetInflowRatio", label: "小单" },
] as const;

const { snapshot, loading, loadError, manualRefresh } = useMarketSnapshotStream();
const fundDays = ref<5 | 10 | 20>(20);
const visibleFundTypes = ref<FundType[]>(["MAIN"]);

const fundModule = computed(() => snapshot.value?.modules.marketFundFlow ?? null);
const fundSeries = computed(() =>
  (fundModule.value?.data?.series ?? []).slice(-fundDays.value).map(toChartPoint),
);
const fundOption = computed(() =>
  buildMarketFundOption(fundSeries.value, visibleFundTypes.value, "上证指数"),
);

function top5Module(kind: SectorKey): SnapshotModule<SnapshotTop5> | null {
  return snapshot.value?.modules[kind === "industry" ? "industryTop5" : "conceptTop5"] ?? null;
}

function hasTop5Data(kind: SectorKey): boolean {
  return Boolean(top5Module(kind)?.data);
}

function rankingValue(item: SnapshotRankingItem, kind: RankingKey): string {
  return kind === "topRise" || kind === "topFall"
    ? formatPercent(item.changePercent)
    : `${formatAmount(item.netFlowAmount)}元`;
}

</script>

<template>
  <div class="snapshot-dashboard">
    <header class="snapshot-intro">
      <div>
        <p class="snapshot-kicker">AKSHARE · MARKET SNAPSHOT V1</p>
        <h1>板块与大盘资金总览</h1>
        <p>板块榜单与大盘资金分别标注参考交易日、源数据日期及采集状态。</p>
      </div>
      <div class="snapshot-intro__actions">
        <span>{{ snapshotGeneratedLabel(snapshot) }}</span>
        <button type="button" :disabled="loading" @click="manualRefresh">
          <Refresh class="snapshot-refresh-icon" :class="{ 'is-spinning': loading }" />
          重新读取快照
        </button>
      </div>
    </header>

    <p v-if="loadError" class="snapshot-alert" role="alert">
      {{ snapshot ? "读取失败，仍显示上次取得的快照。" : "快照暂不可用。" }}
      {{ loadError }}
    </p>
    <p v-if="!snapshot && !loading" class="snapshot-empty">
      暂无市场快照。请手动完成采集后重新读取。
    </p>

    <section class="snapshot-section" aria-labelledby="top5-title">
      <div class="snapshot-section__heading">
        <div>
          <p class="snapshot-kicker">01 / RANKINGS</p>
          <h2 id="top5-title">板块 Top 5</h2>
        </div>
      </div>
      <div class="snapshot-grid">
        <MarketPanel
          v-for="kind in sectorKinds"
          :key="kind.key"
          :title="`${kind.label}排行`"
          :status="top5Module(kind.key)?.status ?? 'ERROR'"
          :loading="loading && !snapshot"
          :has-data="hasTop5Data(kind.key)"
          :message="top5Module(kind.key)?.message ?? loadError"
        >
          <div class="snapshot-meta" aria-live="polite">
            <span>{{ snapshotStatusLabel(top5Module(kind.key)) }}</span>
            <span>{{ snapshotDateLabel(top5Module(kind.key)) }}</span>
            <span v-if="top5Module(kind.key)?.data">同花顺 · 盘中榜单</span>
            <span>上次成功：{{ formatDateTime(top5Module(kind.key)?.lastSuccessAt) }}</span>
          </div>
          <div class="snapshot-rankings">
            <div v-for="ranking in rankingKinds" :key="ranking.key" class="snapshot-ranking">
              <h3>{{ ranking.label }}</h3>
              <ol v-if="top5Module(kind.key)?.data?.[ranking.key]?.length">
                <li v-for="item in top5Module(kind.key)?.data?.[ranking.key] ?? []" :key="`${item.sectorType}:${item.sectorName}`">
                  <span>{{ item.sectorName }}</span>
                  <span :class="`tone-${valueTone(ranking.unit === 'change' ? item.changePercent : item.netFlowAmount)}`">{{ rankingValue(item, ranking.key) }}</span>
                </li>
              </ol>
              <p v-else class="snapshot-no-rank">暂无符合方向的数据</p>
            </div>
          </div>
        </MarketPanel>
      </div>
    </section>

    <section class="snapshot-section" aria-labelledby="fund-title">
      <div class="snapshot-section__heading">
        <div>
          <p class="snapshot-kicker">02 / CAPITAL FLOW</p>
          <h2 id="fund-title">大盘资金流向</h2>
        </div>
      </div>
      <MarketPanel
        title="沪深市场资金流"
        :status="fundModule?.status ?? 'ERROR'"
        :loading="loading && !snapshot"
        :has-data="Boolean(fundModule?.data?.latest)"
        :message="fundModule?.message ?? loadError"
      >
        <div class="snapshot-meta" aria-live="polite">
          <span>{{ snapshotStatusLabel(fundModule) }}</span>
          <span>{{ snapshotDateLabel(fundModule) }}</span>
          <span>上次成功：{{ formatDateTime(fundModule?.lastSuccessAt) }}</span>
        </div>
        <div class="snapshot-fund-head">
          <div>
            <small>最新可得交易日 · 主力净流入</small>
            <strong :class="`tone-${valueTone(fundModule?.data?.latest.mainNetInflow)}`">{{ formatAmount(fundModule?.data?.latest.mainNetInflow) }}<em> 元</em></strong>
            <span>净占比 {{ formatPercent(fundModule?.data?.latest.mainNetInflowRatio) }}</span>
          </div>
          <div class="market-controls" role="group" aria-label="趋势交易日范围">
            <button v-for="days in [5, 10, 20] as const" :key="days" type="button" :class="{ 'is-active': fundDays === days }" :aria-pressed="fundDays === days" @click="fundDays = days">{{ days }} 日</button>
          </div>
        </div>
        <div class="snapshot-fund-metrics">
          <div v-for="metric in fundMetrics" :key="metric.key">
            <small>{{ metric.label }}净流入</small>
            <strong :class="`tone-${valueTone(fundModule?.data?.latest[metric.key])}`">{{ formatAmount(fundModule?.data?.latest[metric.key]) }}</strong>
            <span>净占比 {{ formatPercent(fundModule?.data?.latest[metric.ratio]) }}</span>
          </div>
        </div>
        <BaseChart :option="fundOption" :accessible-label="`大盘资金流近 ${fundDays} 个交易日趋势，${snapshotDateLabel(fundModule)}`" height="300px" />
        <div class="snapshot-indexes">
          <span>上证收盘 <b>{{ formatPlainNumber(fundModule?.data?.latest.shanghaiClose) }}</b> <b :class="`tone-${valueTone(fundModule?.data?.latest.shanghaiChangePercent)}`">{{ formatPercent(fundModule?.data?.latest.shanghaiChangePercent) }}</b></span>
          <span>深证收盘 <b>{{ formatPlainNumber(fundModule?.data?.latest.shenzhenClose) }}</b> <b :class="`tone-${valueTone(fundModule?.data?.latest.shenzhenChangePercent)}`">{{ formatPercent(fundModule?.data?.latest.shenzhenChangePercent) }}</b></span>
        </div>
        <p class="snapshot-note">金额单位为元；净占比和涨跌幅为百分数。折线展示主力资金与上证指数收盘点位。</p>
      </MarketPanel>
    </section>
  </div>
</template>

<style scoped>
.snapshot-dashboard { display: grid; gap: 22px; }
.snapshot-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 14px 2px 4px; }
.snapshot-kicker { margin: 0 0 5px; color: var(--market-primary); font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.snapshot-intro h1 { margin: 0 0 8px; font-size: clamp(22px, 2.4vw, 30px); line-height: 1.2; }
.snapshot-intro p:not(.snapshot-kicker) { margin: 0; color: var(--market-muted); font-size: 13px; line-height: 1.6; }
.snapshot-intro__actions { display: flex; align-items: flex-end; flex-direction: column; gap: 8px; color: var(--market-muted); font-size: 12px; }
.snapshot-intro__actions button { min-height: 44px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; color: var(--market-text); border: 1px solid var(--market-border); border-radius: 8px; background: var(--market-surface); cursor: pointer; transition: background var(--market-transition), border-color var(--market-transition); }
.snapshot-intro__actions button:hover { border-color: var(--market-primary); background: var(--market-primary-soft); }
.snapshot-intro__actions button:disabled { opacity: .55; cursor: wait; }
.snapshot-refresh-icon { width: 15px; height: 15px; }
.snapshot-alert, .snapshot-empty { margin: 0; padding: 12px 16px; border: 1px solid var(--market-border); border-radius: 8px; color: var(--market-muted); background: var(--market-panel); font-size: 13px; }
.snapshot-alert { color: #ffb4b4; border-color: rgb(247 101 101 / 38%); }
.snapshot-section { min-width: 0; display: grid; gap: 10px; }
.snapshot-section__heading { min-height: 42px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.snapshot-section__heading h2 { margin: 0; font-size: 18px; }
.snapshot-grid { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.snapshot-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 10px; color: var(--market-muted); font-size: 12px; line-height: 1.5; }
.snapshot-meta span:first-child { color: var(--market-text-secondary); }
.snapshot-note { margin: 4px 0 10px; color: var(--market-muted); font-size: 12px; line-height: 1.5; }
.snapshot-rankings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.snapshot-ranking { min-width: 0; padding: 10px; border: 1px solid var(--market-border-soft); border-radius: 8px; background: var(--market-surface); }
.snapshot-ranking h3 { margin: 0 0 8px; color: var(--market-text); font-size: 13px; }
.snapshot-ranking ol { margin: 0; padding-left: 22px; }
.snapshot-ranking li { padding: 5px 0; color: var(--market-muted); font-size: 12px; }
.snapshot-ranking li::marker { color: var(--market-subtle); }
.snapshot-ranking li span:first-child { display: inline-block; max-width: calc(100% - 84px); overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; white-space: nowrap; }
.snapshot-ranking li span:last-child { float: right; font-variant-numeric: tabular-nums; font-weight: 650; }
.snapshot-no-rank { margin: 0; color: var(--market-subtle); font-size: 12px; }
.snapshot-fund-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.snapshot-fund-head > div:first-child, .snapshot-fund-metrics > div { display: flex; flex-direction: column; gap: 4px; }
.snapshot-fund-head small, .snapshot-fund-metrics small { color: var(--market-muted); font-size: 12px; }
.snapshot-fund-head strong { font-size: clamp(24px, 3vw, 32px); line-height: 1.2; }
.snapshot-fund-head strong em { color: var(--market-muted); font-size: 12px; font-style: normal; font-weight: 400; }
.snapshot-fund-head span, .snapshot-fund-metrics span { color: var(--market-muted); font-size: 12px; }
.snapshot-fund-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
.snapshot-fund-metrics > div { min-width: 0; padding: 12px; border: 1px solid var(--market-border-soft); border-radius: 8px; background: var(--market-surface); }
.snapshot-fund-metrics strong { font-size: 17px; }
.snapshot-indexes { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 6px; color: var(--market-muted); font-size: 12px; }
.snapshot-indexes b { margin-left: 6px; color: var(--market-text); }
.snapshot-indexes b.tone-rise { color: var(--market-rise); }
.snapshot-indexes b.tone-fall { color: var(--market-fall); }
@media (max-width: 1100px) { .snapshot-grid { grid-template-columns: 1fr; } }
@media (max-width: 767px) { .snapshot-intro, .snapshot-fund-head { align-items: flex-start; flex-direction: column; } .snapshot-intro__actions { align-items: flex-start; } .snapshot-rankings { grid-template-columns: 1fr; } .snapshot-fund-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
