<script setup lang="ts">
import { Search } from "@element-plus/icons-vue";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";

import * as marketApi from "@/api/market";
import {
  buildMarketFundOption,
  buildSparklineOption,
  buildTreemapOption,
} from "@/charts/marketOptions";
import BaseChart from "@/components/market/BaseChart.vue";
import MarketPanel from "@/components/market/MarketPanel.vue";
import { useMarketStore } from "@/stores/market";
import type {
  FundType,
  MarketDataStatus,
  MarketFundPoint,
  MarketIndex,
  MarketSummary,
  RankingPeriod,
  SectorAreaMetric,
  SectorDirection,
  SectorMutation,
  SectorRankings,
  SectorSnapshot,
  SectorTopMetric,
  SectorTopStock,
  SectorType,
} from "@/types/market";
import {
  formatAmount,
  formatDateTime,
  formatPercent,
  formatPlainNumber,
  formatSignedNumber,
  valueTone,
} from "@/utils/market";

interface ModuleState {
  status: MarketDataStatus;
  message: string;
  loading: boolean;
}

const INDEX_NAME_BY_CODE: Record<string, string> = {
  "000001": "上证指数",
  "399001": "深证成指",
  "399006": "创业板指",
  "000688": "科创50",
  "000680": "科创综指",
  "000510": "中证A500",
  "000300": "沪深300",
  "000016": "上证50",
  "399330": "深证100",
};

const router = useRouter();
const marketStore = useMarketStore();
const defaultModule = (): ModuleState => ({
  status: "FRESH",
  message: "",
  loading: true,
});

const indices = ref<MarketIndex[]>([]);
const summary = ref<MarketSummary>();
const sectors = ref<SectorSnapshot[]>([]);
const topStocks = ref<SectorTopStock[]>([]);
const rankings = ref<SectorRankings>({
  topRise: [],
  topFall: [],
  topInflow: [],
  topOutflow: [],
});
const fundTrend = ref<MarketFundPoint[]>([]);
const mutations = ref<SectorMutation[]>([]);

const moduleStates = ref<Record<string, ModuleState>>({
  indices: defaultModule(),
  summary: defaultModule(),
  heatmap: defaultModule(),
  topStocks: defaultModule(),
  rankings: defaultModule(),
  fundTrend: defaultModule(),
  mutations: defaultModule(),
});

const sectorType = ref<SectorType>("industry");
const areaMetric = ref<SectorAreaMetric>("turnover");
const sectorDirection = ref<SectorDirection>("all");
const sectorKeyword = ref("");
const sectorView = ref<"HEATMAP" | "LIST">("HEATMAP");
const selectedSectorCode = ref("");
const topMetric = ref<SectorTopMetric>("changepercent");
const rankingPeriod = ref<RankingPeriod>("today");
const fundDays = ref<5 | 10 | 20>(20);
const visibleFundTypes = ref<FundType[]>(["MAIN"]);

const selectedIndex = computed(
  () =>
    indices.value.find(
      (item) => item.code === marketStore.selectedIndexCode,
    ) || indices.value[0],
);
const selectedSector = computed(() =>
  sectors.value.find((item) => item.code === selectedSectorCode.value),
);
const filteredSectors = computed(() => {
  const keyword = sectorKeyword.value.trim().toLowerCase();
  return sectors.value.filter((sector) => {
    if (keyword && !sector.name.toLowerCase().includes(keyword)) return false;
    if (sectorDirection.value === "up") return (sector.changePercent ?? 0) > 0;
    if (sectorDirection.value === "down") return (sector.changePercent ?? 0) < 0;
    return true;
  });
});
const heatmapSummary = computed(() => {
  if (!filteredSectors.value.length) return "当前筛选条件下没有板块数据。";
  const rise = filteredSectors.value.filter(
    (item) => (item.changePercent ?? 0) > 0,
  ).length;
  return `当前展示 ${filteredSectors.value.length} 个板块，其中上涨 ${rise} 个、下跌 ${filteredSectors.value.length - rise} 个。`;
});

function indexDisplayName(item: MarketIndex): string {
  return item.name?.trim() || INDEX_NAME_BY_CODE[item.code] || "未知指数";
}

function setModuleLoading(key: string): void {
  moduleStates.value[key] = { ...moduleStates.value[key]!, loading: true };
}

function setModuleSuccess(
  key: string,
  status: MarketDataStatus,
  message = "",
): void {
  moduleStates.value[key] = { status, message, loading: false };
}

function setModuleFailure(key: string, error: unknown, hasData: boolean): void {
  const message = error instanceof Error ? error.message : "模块刷新失败";
  const status: MarketDataStatus = hasData ? "STALE" : "ERROR";
  moduleStates.value[key] = { status, message, loading: false };
  marketStore.markModuleFailure(key, message, hasData);
}

async function loadIndices(): Promise<void> {
  setModuleLoading("indices");
  try {
    const response = await marketApi.getIndices();
    indices.value = response.data || [];
    if (
      indices.value.length &&
      !indices.value.some((item) => item.code === marketStore.selectedIndexCode)
    ) {
      marketStore.selectIndex(indices.value[0]!.code);
    }
    marketStore.markModule("indices", response);
    setModuleSuccess("indices", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("indices", error, indices.value.length > 0);
  }
}

async function loadSummary(): Promise<void> {
  setModuleLoading("summary");
  try {
    const response = await marketApi.getMarketSummary();
    summary.value = response.data;
    marketStore.markModule("summary", response);
    setModuleSuccess("summary", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("summary", error, Boolean(summary.value));
  }
}

async function loadHeatmap(): Promise<void> {
  setModuleLoading("heatmap");
  try {
    const response = await marketApi.getSectorHeatmap({
      sectorType: sectorType.value,
    });
    sectors.value = response.data.list;
    if (
      sectors.value.length &&
      !sectors.value.some((item) => item.code === selectedSectorCode.value)
    ) {
      selectedSectorCode.value = [...sectors.value].sort(
        (a, b) => (b.turnover ?? -1) - (a.turnover ?? -1),
      )[0]!.code;
    }
    marketStore.markModule("heatmap", response);
    setModuleSuccess("heatmap", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("heatmap", error, sectors.value.length > 0);
  }
}

async function loadTopStocks(): Promise<void> {
  if (!selectedSectorCode.value) {
    topStocks.value = [];
    setModuleSuccess("topStocks", "NO_DATA", "请选择一个板块");
    return;
  }
  setModuleLoading("topStocks");
  try {
    const response = await marketApi.getSectorTopStocks({
      sectorType: sectorType.value,
      sectorCode: selectedSectorCode.value,
      metric: topMetric.value,
    });
    topStocks.value = response.data || [];
    marketStore.markModule("topStocks", response);
    setModuleSuccess("topStocks", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("topStocks", error, topStocks.value.length > 0);
  }
}

async function loadRankings(): Promise<void> {
  setModuleLoading("rankings");
  try {
    const response = await marketApi.getSectorRankings({
      period: rankingPeriod.value,
      sectorType: sectorType.value,
    });
    rankings.value = response.data;
    marketStore.markModule("rankings", response);
    setModuleSuccess("rankings", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("rankings", error, rankings.value.topRise.length > 0);
  }
}

async function loadFundTrend(): Promise<void> {
  setModuleLoading("fundTrend");
  try {
    const response = await marketApi.getMarketFundTrend({
      days: fundDays.value,
      indexCode: marketStore.selectedIndexCode,
    });
    fundTrend.value = response.data || [];
    marketStore.markModule("fundTrend", response);
    setModuleSuccess("fundTrend", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("fundTrend", error, fundTrend.value.length > 0);
  }
}

async function loadMutations(): Promise<void> {
  setModuleLoading("mutations");
  try {
    const response = await marketApi.getSectorMutations();
    mutations.value = (response.data || []).slice(0, 5);
    marketStore.markModule("mutations", response);
    setModuleSuccess("mutations", response.dataStatus, response.message);
  } catch (error) {
    setModuleFailure("mutations", error, mutations.value.length > 0);
  }
}

async function loadAll(): Promise<void> {
  await Promise.allSettled([
    loadIndices(),
    loadSummary(),
    loadHeatmap(),
    loadRankings(),
    loadMutations(),
  ]);
  await Promise.allSettled([loadTopStocks(), loadFundTrend()]);
}

function selectSector(code: string, type?: SectorType): void {
  if (type && type !== sectorType.value) {
    sectorType.value = type;
  }
  selectedSectorCode.value = code;
}

function handleTreemapClick(raw: unknown): void {
  const params = raw as { data?: { code?: string } };
  if (params.data?.code) selectSector(params.data.code);
}

function goToStock(stockCode: string): void {
  void router.push({
    path: "/market/stockMonitor",
    query: { stockCode },
  });
}

watch(() => marketStore.refreshSignal, loadAll, { immediate: true });
watch(sectorType, (value) => {
  if (value === "concept") areaMetric.value = "marketcap";
  void loadHeatmap();
});
watch([selectedSectorCode, topMetric], loadTopStocks);
watch([rankingPeriod, sectorType], loadRankings);
watch([fundDays, () => marketStore.selectedIndexCode], loadFundTrend);
</script>

<template>
  <div class="overview-page">
    <section class="overview-heading">
      <div>
        <h1>大盘与板块总览</h1>
        <span>指数、市场情绪、板块和资金趋势</span>
      </div>
      <p class="overview-heading__note">
        行情仅供数据观察，不构成投资建议
      </p>
    </section>

    <MarketPanel
      title="核心指数"
      :status="moduleStates.indices?.status"
      :message="moduleStates.indices?.message"
      :loading="moduleStates.indices?.loading"
      :has-data="indices.length > 0"
      class="indices-panel"
    >
      <template #skeleton>
        <div class="index-skeleton-grid">
          <span v-for="item in 9" :key="item" />
        </div>
      </template>
      <template #retry>
        <button class="market-retry" type="button" @click="loadIndices">重新加载</button>
      </template>
      <div class="index-grid">
        <button
          v-for="item in indices"
          :key="item.code"
          class="index-card"
          :class="{ 'is-selected': item.code === marketStore.selectedIndexCode }"
          type="button"
          :aria-pressed="item.code === marketStore.selectedIndexCode"
          @click="marketStore.selectIndex(item.code)"
        >
          <span class="index-card__title">
            <strong>{{ indexDisplayName(item) }}</strong>
            <small>{{ item.code }}</small>
          </span>
          <span class="index-card__value">{{ formatPlainNumber(item.currentPoint) }}</span>
          <span :class="`tone-${valueTone(item.changePercent)}`">
            {{ formatSignedNumber(item.changeAmount) }}
            <b>{{ formatPercent(item.changePercent) }}</b>
          </span>
          <BaseChart
            :option="buildSparklineOption(item.points || [], item.changePercent)"
            :accessible-label="`${indexDisplayName(item)}当日迷你走势`"
            height="42px"
          />
          <span class="index-card__footer">
            <small>成交额 {{ formatAmount(item.turnover) }}</small>
            <small>{{ formatDateTime(item.updateTime) }}</small>
          </span>
        </button>
      </div>
    </MarketPanel>

    <MarketPanel
      title="市场总览"
      :status="moduleStates.summary?.status"
      :message="moduleStates.summary?.message"
      :loading="moduleStates.summary?.loading"
      :has-data="Boolean(summary)"
      class="summary-panel"
    >
      <template #retry>
        <button class="market-retry" type="button" @click="loadSummary">重新加载</button>
      </template>
      <div v-if="summary" class="summary-grid">
        <div class="summary-primary">
          <small>沪深京总成交额</small>
          <strong>{{ formatAmount(summary.totalTurnover) }}</strong>
          <span :class="`tone-${valueTone(summary.turnoverChangePercent)}`">
            较前一交易日 {{ formatPercent(summary.turnoverChangePercent) }}
          </span>
        </div>
        <div><small>上涨 / 下跌 / 平盘</small><strong><i class="tone-rise">{{ summary.riseCount ?? "—" }}</i> / <i class="tone-fall">{{ summary.fallCount ?? "—" }}</i> / {{ summary.flatCount ?? "—" }}</strong></div>
        <div><small>涨停 / 跌停</small><strong><i class="tone-rise">{{ summary.limitUpCount ?? "—" }}</i> / <i class="tone-fall">{{ summary.limitDownCount ?? "—" }}</i></strong></div>
        <div><small>全市场主力净流入</small><strong :class="`tone-${valueTone(summary.mainNetInflow)}`">{{ formatAmount(summary.mainNetInflow) }}</strong></div>
        <div><small>数据更新时间</small><strong>{{ formatDateTime(summary.updateTime) }}</strong></div>
      </div>
    </MarketPanel>

    <div class="overview-main-grid">
      <MarketPanel
        title="板块每日热力图"
        :status="moduleStates.heatmap?.status"
        :message="moduleStates.heatmap?.message"
        :loading="moduleStates.heatmap?.loading"
        :has-data="filteredSectors.length > 0"
        class="heatmap-panel"
      >
        <template #actions>
          <div class="heatmap-actions">
            <div class="market-controls">
              <button :class="{ 'is-active': sectorType === 'industry' }" @click="sectorType = 'industry'">行业</button>
              <button :class="{ 'is-active': sectorType === 'concept' }" @click="sectorType = 'concept'">概念</button>
              <button :class="{ 'is-active': areaMetric === 'turnover' }" :disabled="sectorType === 'concept'" @click="areaMetric = 'turnover'">成交额面积</button>
              <button :class="{ 'is-active': areaMetric === 'marketcap' }" @click="areaMetric = 'marketcap'">市值面积</button>
              <button v-for="item in ([['all','全部'],['up','上涨'],['down','下跌']] as const)" :key="item[0]" :class="{ 'is-active': sectorDirection === item[0] }" @click="sectorDirection = item[0]">{{ item[1] }}</button>
            </div>
            <el-input v-model="sectorKeyword" clearable placeholder="搜索板块" :prefix-icon="Search" class="sector-search" />
            <div class="market-controls view-controls">
              <button :class="{ 'is-active': sectorView === 'HEATMAP' }" @click="sectorView = 'HEATMAP'">热力图</button>
              <button :class="{ 'is-active': sectorView === 'LIST' }" @click="sectorView = 'LIST'">列表</button>
            </div>
          </div>
        </template>
        <template #retry>
          <button class="market-retry" type="button" @click="loadHeatmap">重新加载</button>
        </template>
        <BaseChart
          v-if="sectorView === 'HEATMAP'"
          :option="buildTreemapOption(filteredSectors, areaMetric)"
          :accessible-label="heatmapSummary"
          height="350px"
          @chart-click="handleTreemapClick"
        />
        <div v-else class="sector-list" role="list" :aria-label="heatmapSummary">
          <button
            v-for="sector in filteredSectors"
            :key="sector.code"
            type="button"
            :class="{ 'is-selected': sector.code === selectedSectorCode }"
            @click="selectSector(sector.code)"
          >
            <span><strong>{{ sector.name }}</strong><small>{{ sector.code }}</small></span>
            <span :class="`tone-${valueTone(sector.changePercent)}`">{{ formatPercent(sector.changePercent) }}</span>
            <span>{{ formatAmount(areaMetric === 'turnover' ? sector.turnover : sector.marketCap) }}</span>
          </button>
        </div>
        <div class="heatmap-footer">
          <div class="heatmap-legend" aria-label="板块涨跌颜色图例">
            <span>跌幅较大</span><i /><i /><i /><i /><i /><span>涨幅较大</span>
          </div>
          <p class="chart-summary">{{ heatmapSummary }}</p>
        </div>
      </MarketPanel>

      <MarketPanel
        :title="`${selectedSector?.name || '所选板块'} TOP5 股票`"
        :status="moduleStates.topStocks?.status"
        :message="moduleStates.topStocks?.message"
        :loading="moduleStates.topStocks?.loading"
        :has-data="topStocks.length > 0"
        class="top-stocks-panel"
      >
        <template #actions>
          <div class="market-controls">
            <button v-for="item in ([['changepercent','涨幅'],['mainnetinflow','主力净流入'],['turnover','成交额']] as const)" :key="item[0]" :class="{ 'is-active': topMetric === item[0] }" @click="topMetric = item[0]">{{ item[1] }}</button>
          </div>
        </template>
        <template #retry>
          <button class="market-retry" type="button" @click="loadTopStocks">重新加载</button>
        </template>
        <div class="top-stock-table" role="table" aria-label="所选板块TOP5股票">
          <div class="top-stock-table__head" role="row">
            <span>排名 / 股票</span><span>最新价 / 涨跌幅</span>
            <span>成交额 / 换手率</span><span>主力净流入 / 占比</span><span>监控</span>
          </div>
          <div v-for="stock in topStocks" :key="stock.stockCode" class="top-stock-row" role="row">
            <div class="stock-identity">
              <span class="rank">{{ stock.rank ?? "—" }}</span>
              <span><strong>{{ stock.stockName }}</strong><small>{{ stock.stockCode }}</small></span>
            </div>
            <div><strong>{{ formatPlainNumber(stock.latestPrice) }}</strong><small :class="`tone-${valueTone(stock.changePercent)}`">{{ formatPercent(stock.changePercent) }}</small></div>
            <div><strong>{{ formatAmount(stock.turnover) }}</strong><small>{{ formatPercent(stock.turnoverRate) }}</small></div>
            <div><strong :class="`tone-${valueTone(stock.mainNetInflow)}`">{{ formatAmount(stock.mainNetInflow) }}</strong><small>{{ formatPercent(stock.mainNetInflowRatio) }}</small></div>
            <button v-if="stock.monitorEnabled" class="monitor-link" type="button" @click="goToStock(stock.stockCode)">查看资金</button>
            <span v-else class="not-enabled">未启用</span>
          </div>
        </div>
      </MarketPanel>
    </div>

    <div class="overview-bottom-grid">
      <MarketPanel
        title="板块强弱榜"
        :status="moduleStates.rankings?.status"
        :message="moduleStates.rankings?.message"
        :loading="moduleStates.rankings?.loading"
        :has-data="rankings.topRise.length > 0"
      >
        <template #actions>
          <div class="market-controls">
            <button v-for="item in ([['today','今日'],['5d','近5日'],['10d','近10日']] as const)" :key="item[0]" :class="{ 'is-active': rankingPeriod === item[0] }" @click="rankingPeriod = item[0]">{{ item[1] }}</button>
          </div>
        </template>
        <template #retry>
          <button class="market-retry" type="button" @click="loadRankings">重新加载</button>
        </template>
        <div class="ranking-grid">
          <div
            v-for="group in [
              { title: '涨幅 TOP5', data: rankings.topRise, tone: 'rise', unit: 'percent' },
              { title: '跌幅 TOP5', data: rankings.topFall, tone: 'fall', unit: 'percent' },
              { title: '净流入 TOP5', data: rankings.topInflow, tone: 'rise', unit: 'amount' },
              { title: '净流出 TOP5', data: rankings.topOutflow, tone: 'fall', unit: 'amount' },
            ]"
            :key="group.title"
          >
            <h3>{{ group.title }}</h3>
            <button v-for="(item, index) in group.data" :key="item.sectorCode" type="button" @click="selectSector(item.sectorCode, item.sectorType)">
              <span><i>{{ index + 1 }}</i>{{ item.sectorName }}</span>
              <b :class="`tone-${group.tone}`">{{ group.unit === 'percent' ? formatPercent(item.value) : formatAmount(item.value) }}</b>
            </button>
          </div>
        </div>
      </MarketPanel>

      <MarketPanel
        title="市场资金趋势"
        :status="moduleStates.fundTrend?.status"
        :message="moduleStates.fundTrend?.message"
        :loading="moduleStates.fundTrend?.loading"
        :has-data="fundTrend.length > 0"
        class="fund-panel"
      >
        <template #actions>
          <div class="market-controls">
            <button v-for="days in ([5,10,20] as const)" :key="days" :class="{ 'is-active': fundDays === days }" @click="fundDays = days">近{{ days }}日</button>
          </div>
        </template>
        <template #retry>
          <button class="market-retry" type="button" @click="loadFundTrend">重新加载</button>
        </template>
        <el-checkbox-group v-model="visibleFundTypes" class="fund-types">
          <el-checkbox-button v-for="item in ([['MAIN','主力'],['SUPER_LARGE','超大单'],['LARGE','大单'],['MEDIUM','中单'],['SMALL','小单']] as const)" :key="item[0]" :value="item[0]">{{ item[1] }}</el-checkbox-button>
        </el-checkbox-group>
        <BaseChart
          :option="buildMarketFundOption(fundTrend, visibleFundTypes, selectedIndex?.name || '指数')"
          :accessible-label="`市场近${fundDays}日资金趋势，叠加${selectedIndex?.name || '所选指数'}走势`"
          height="320px"
        />
      </MarketPanel>
    </div>

    <MarketPanel
      title="板块异动"
      :status="moduleStates.mutations?.status"
      :message="moduleStates.mutations?.message"
      :loading="moduleStates.mutations?.loading"
      :has-data="mutations.length > 0"
    >
      <template #retry>
        <button class="market-retry" type="button" @click="loadMutations">重新加载</button>
      </template>
      <div class="mutation-list">
        <button v-for="item in mutations" :key="item.id" type="button" @click="selectSector(item.sectorCode, item.sectorType)">
          <span class="mutation-time">{{ formatDateTime(item.mutationTime) }}</span>
          <strong>{{ item.sectorName }}</strong>
          <span>{{ item.direction === 'UP' ? '向上异动' : item.direction === 'DOWN' ? '向下异动' : '双向异动' }} · {{ item.mutationCount ?? "—" }} 次</span>
          <b :class="`tone-${valueTone(item.changePercent)}`">{{ formatPercent(item.changePercent) }}</b>
          <span>主力 {{ formatAmount(item.mainNetInflow) }}</span>
          <span>高频：{{ item.frequentStockName || "—" }}</span>
        </button>
      </div>
    </MarketPanel>
  </div>
</template>

<style scoped>
.overview-page {
  display: grid;
  gap: 12px;
}

.overview-heading {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 2px;
}

.overview-heading > div {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.overview-heading h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.overview-heading span,
.overview-heading__note {
  margin: 0;
  color: var(--market-muted);
  font-size: 12px;
}

.overview-heading__note {
  color: var(--market-subtle);
}

.index-grid,
.index-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.index-skeleton-grid {
  width: 100%;
}

.index-skeleton-grid > span {
  height: 124px;
  border: 1px solid var(--market-border-soft);
  border-radius: 8px;
  background: linear-gradient(
    100deg,
    var(--market-panel) 28%,
    var(--market-surface) 48%,
    var(--market-panel) 68%
  );
  background-size: 240% 100%;
  animation: index-skeleton 1.4s linear infinite;
}

.index-card {
  position: relative;
  height: 124px;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  grid-template-rows: auto auto 1fr auto;
  gap: 2px 8px;
  padding: 10px 10px 9px 13px;
  overflow: hidden;
  color: var(--market-text);
  text-align: left;
  border: 1px solid var(--market-border-soft);
  border-radius: 8px;
  background: #081321;
  cursor: pointer;
  transition:
    border-color var(--market-transition),
    background var(--market-transition);
}

.index-card::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: transparent;
  content: "";
}

.index-card:hover {
  border-color: #3d587a;
  background: var(--market-surface);
}

.index-card.is-selected {
  border-color: #345f94;
  background: rgb(59 130 246 / 9%);
}

.index-card.is-selected::before {
  background: var(--market-primary);
}

.index-card__title,
.index-card__footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

.index-card__title strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.index-card small {
  color: var(--market-subtle);
  font-size: 11px;
}

.index-card__value {
  grid-column: 1;
  grid-row: 2;
  display: block;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.index-card > span:nth-child(3) {
  grid-column: 1;
  grid-row: 3;
  font-size: 12px;
}

.index-card > span:nth-child(3) b {
  margin-left: 5px;
}

.index-card :deep(.base-chart) {
  grid-column: 2;
  grid-row: 2 / 4;
  min-height: 42px;
  align-self: center;
}

.index-card__footer {
  grid-row: 4;
  align-items: center;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1.35fr repeat(4, 1fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--market-border-soft);
  border-radius: 8px;
  background: var(--market-border-soft);
}

.summary-panel :deep(.market-empty) {
  min-height: 64px;
  flex-direction: row;
  padding: 6px 12px;
}

.summary-grid > div {
  min-height: 66px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 9px 13px;
  background: #081321;
}

.summary-grid small {
  color: var(--market-subtle);
  font-size: 12px;
}

.summary-grid strong {
  color: var(--market-text);
  font-size: 15px;
  font-style: normal;
}

.summary-grid i {
  font-style: normal;
}

.summary-primary strong {
  font-size: 23px;
}

.summary-primary span {
  font-size: 12px;
}

.overview-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(420px, 1fr);
  gap: 12px;
}

.heatmap-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}

.sector-search {
  width: 150px;
}

.sector-list {
  height: 350px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-content: start;
  gap: 6px;
  overflow: auto;
}

.sector-list button {
  min-height: 58px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 8px;
  align-items: center;
  padding: 8px 10px;
  color: var(--market-text);
  text-align: left;
  border: 1px solid var(--market-border-soft);
  border-radius: 7px;
  background: #081321;
  cursor: pointer;
}

.sector-list button.is-selected {
  border-color: var(--market-primary);
  background: var(--market-primary-soft);
}

.sector-list button > span:first-child {
  display: flex;
  flex-direction: column;
}

.sector-list small,
.sector-list button > span:last-child {
  color: var(--market-muted);
  font-size: 12px;
}

.sector-list button > span:last-child {
  grid-column: 1 / -1;
}

.heatmap-footer {
  min-height: 30px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 6px;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--market-muted);
  font-size: 12px;
  white-space: nowrap;
}

.heatmap-legend i {
  width: 20px;
  height: 7px;
}

.heatmap-legend i:nth-of-type(1) { background: #167451; }
.heatmap-legend i:nth-of-type(2) { background: #28594d; }
.heatmap-legend i:nth-of-type(3) { background: #334155; }
.heatmap-legend i:nth-of-type(4) { background: #8e3843; }
.heatmap-legend i:nth-of-type(5) { background: #e65360; }

.chart-summary {
  margin: 0;
  color: var(--market-muted);
  font-size: 12px;
  text-align: right;
}

.top-stock-table {
  display: grid;
  border: 1px solid var(--market-border-soft);
  border-radius: 8px;
  overflow: hidden;
}

.top-stock-table__head,
.top-stock-row {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr 1.05fr 1.15fr 74px;
  align-items: center;
  gap: 8px;
}

.top-stock-table__head {
  min-height: 36px;
  padding: 0 9px;
  color: var(--market-subtle);
  background: #08111e;
  font-size: 11px;
}

.top-stock-table__head span:not(:first-child) {
  text-align: right;
}

.top-stock-row {
  min-height: 61px;
  padding: 7px 9px;
  border-top: 1px solid var(--market-border-soft);
  background: #0a1524;
  transition: background var(--market-transition);
}

.top-stock-row:hover {
  background: var(--market-surface);
}

.top-stock-row > div {
  min-width: 0;
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 3px;
  text-align: right;
}

.top-stock-row strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--market-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-stock-row small {
  color: var(--market-muted);
  font-size: 11px;
}

.stock-identity {
  align-items: center !important;
  flex-direction: row !important;
  gap: 8px !important;
  text-align: left !important;
}

.stock-identity > span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rank {
  width: 27px;
  height: 27px;
  flex: 0 0 27px;
  display: grid;
  place-items: center;
  color: #93c5fd;
  border-radius: 6px;
  background: rgb(59 130 246 / 14%);
  font-size: 12px;
}

.monitor-link,
.not-enabled,
.market-retry {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
}

.monitor-link,
.market-retry {
  color: #dbeafe;
  border: 1px solid #326bb4;
  background: rgb(37 99 235 / 16%);
  cursor: pointer;
}

.not-enabled {
  color: var(--market-subtle);
  border: 1px solid var(--market-border);
}

.overview-bottom-grid {
  display: grid;
  grid-template-columns: minmax(520px, 0.9fr) minmax(0, 1.1fr);
  gap: 12px;
}

.ranking-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.ranking-grid h3 {
  margin: 0 0 6px;
  color: var(--market-muted);
  font-size: 12px;
  font-weight: 600;
}

.ranking-grid button {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 6px;
  color: #d5dce7;
  border: 0;
  border-bottom: 1px solid var(--market-border-soft);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.ranking-grid button:hover {
  background: var(--market-surface);
}

.ranking-grid button span {
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-grid i {
  color: var(--market-subtle);
  font-style: normal;
}

.fund-types {
  margin-bottom: 4px;
}

.mutation-list {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 7px;
}

.mutation-list button {
  min-width: 0;
  min-height: 88px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-content: center;
  gap: 5px 10px;
  padding: 9px 10px;
  color: var(--market-muted);
  text-align: left;
  border: 1px solid var(--market-border-soft);
  border-radius: 7px;
  background: #081321;
  cursor: pointer;
  font-size: 12px;
}

.mutation-list button:hover {
  border-color: #3d587a;
  background: var(--market-surface);
}

.mutation-list strong {
  color: var(--market-text);
  font-size: 13px;
}

.mutation-time {
  grid-column: 1 / -1;
  color: var(--market-subtle);
}

@keyframes index-skeleton {
  to { background-position: -240% 0; }
}

@media (max-width: 1439px) {
  .overview-main-grid {
    grid-template-columns: minmax(0, 1.55fr) minmax(390px, 1fr);
  }

  .overview-bottom-grid {
    grid-template-columns: minmax(460px, 0.9fr) minmax(0, 1.1fr);
  }

  .heatmap-actions {
    max-width: 760px;
  }
}

@media (max-width: 1023px) {
  .index-grid,
  .index-skeleton-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .summary-primary {
    grid-column: 1 / -1;
  }

  .overview-main-grid,
  .overview-bottom-grid {
    grid-template-columns: 1fr;
  }

  .ranking-grid,
  .mutation-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 767px) {
  .overview-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .overview-heading > div {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .overview-heading__note {
    display: none;
  }

  .index-grid,
  .index-skeleton-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .heatmap-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .sector-search {
    width: 100%;
  }

  .sector-list {
    grid-template-columns: 1fr;
  }

  .heatmap-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .chart-summary {
    text-align: left;
  }

  .top-stock-table__head {
    display: none;
  }

  .top-stock-row {
    grid-template-columns: 1.2fr 1fr;
    gap: 8px 12px;
  }

  .top-stock-row > :nth-child(n + 3) {
    display: none;
  }

  .ranking-grid,
  .mutation-list {
    grid-template-columns: 1fr;
  }
}
</style>
