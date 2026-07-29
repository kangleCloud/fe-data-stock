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
        <p>MARKET OVERVIEW</p>
        <h1>大盘与板块总览</h1>
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
    >
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
            <strong>{{ item.name }}</strong><small>{{ item.code }}</small>
          </span>
          <span class="index-card__value">{{ formatPlainNumber(item.currentPoint) }}</span>
          <span :class="`tone-${valueTone(item.changePercent)}`">
            {{ formatSignedNumber(item.changeAmount) }}
            <b>{{ formatPercent(item.changePercent) }}</b>
          </span>
          <BaseChart
            :option="buildSparklineOption(item.points || [], item.changePercent)"
            :accessible-label="`${item.name}当日迷你走势`"
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
    >
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
          <div class="market-controls">
            <button :class="{ 'is-active': sectorView === 'HEATMAP' }" @click="sectorView = 'HEATMAP'">热力图</button>
            <button :class="{ 'is-active': sectorView === 'LIST' }" @click="sectorView = 'LIST'">列表</button>
          </div>
        </template>
        <div class="heatmap-toolbar">
          <div class="market-controls">
            <button :class="{ 'is-active': sectorType === 'industry' }" @click="sectorType = 'industry'">行业</button>
            <button :class="{ 'is-active': sectorType === 'concept' }" @click="sectorType = 'concept'">概念</button>
            <button :class="{ 'is-active': areaMetric === 'turnover' }" :disabled="sectorType === 'concept'" @click="areaMetric = 'turnover'">面积：成交额</button>
            <button :class="{ 'is-active': areaMetric === 'marketcap' }" @click="areaMetric = 'marketcap'">面积：总市值</button>
            <button v-for="item in ([['all','全部'],['up','仅上涨'],['down','仅下跌']] as const)" :key="item[0]" :class="{ 'is-active': sectorDirection === item[0] }" @click="sectorDirection = item[0]">{{ item[1] }}</button>
          </div>
          <el-input v-model="sectorKeyword" clearable placeholder="搜索板块名称" :prefix-icon="Search" class="sector-search" />
        </div>
        <BaseChart
          v-if="sectorView === 'HEATMAP'"
          :option="buildTreemapOption(filteredSectors, areaMetric)"
          :accessible-label="heatmapSummary"
          height="420px"
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
        <p class="chart-summary">{{ heatmapSummary }}</p>
      </MarketPanel>

      <MarketPanel
        :title="`${selectedSector?.name || '所选板块'} TOP5 股票`"
        :status="moduleStates.topStocks?.status"
        :message="moduleStates.topStocks?.message"
        :loading="moduleStates.topStocks?.loading"
        :has-data="topStocks.length > 0"
      >
        <template #actions>
          <div class="market-controls">
            <button v-for="item in ([['changepercent','涨幅'],['mainnetinflow','主力净流入'],['turnover','成交额']] as const)" :key="item[0]" :class="{ 'is-active': topMetric === item[0] }" @click="topMetric = item[0]">{{ item[1] }}</button>
          </div>
        </template>
        <div class="top-stock-list">
          <article v-for="stock in topStocks" :key="stock.stockCode">
            <span class="rank">{{ stock.rank ?? "—" }}</span>
            <div class="stock-name"><strong>{{ stock.stockName }}</strong><small>{{ stock.stockCode }}</small></div>
            <div><small>最新价</small><b>{{ formatPlainNumber(stock.latestPrice) }}</b></div>
            <div><small>涨跌幅</small><b :class="`tone-${valueTone(stock.changePercent)}`">{{ formatPercent(stock.changePercent) }}</b></div>
            <div><small>成交额 / 换手率</small><b>{{ formatAmount(stock.turnover) }} / {{ formatPercent(stock.turnoverRate) }}</b></div>
            <div><small>主力净流入 / 净占比</small><b :class="`tone-${valueTone(stock.mainNetInflow)}`">{{ formatAmount(stock.mainNetInflow) }} / {{ formatPercent(stock.mainNetInflowRatio) }}</b></div>
            <button v-if="stock.monitorEnabled" class="monitor-link" type="button" @click="goToStock(stock.stockCode)">查看资金</button>
            <span v-else class="not-enabled">未启用监控</span>
          </article>
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
.overview-page { display: grid; gap: 14px; }
.overview-heading { display: flex; align-items: flex-end; justify-content: space-between; padding: 2px 2px 0; }
.overview-heading p { margin: 0 0 4px; color: #3b82f6; font-size: 9px; letter-spacing: .18em; }
.overview-heading h1 { margin: 0; font-size: 20px; }
.overview-heading .overview-heading__note { color: #5f718a; letter-spacing: 0; font-size: 11px; }
.index-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.index-card {
  min-width: 0; padding: 10px; text-align: left; color: #f3f7fc; border: 1px solid #1a2b42;
  border-radius: 9px; background: rgba(7, 17, 31, .6); cursor: pointer;
}
.index-card:hover, .index-card.is-selected { border-color: #3b82f6; background: rgba(59, 130, 246, .09); }
.index-card.is-selected { box-shadow: inset 3px 0 #3b82f6; }
.index-card__title, .index-card__footer { display: flex; justify-content: space-between; gap: 6px; }
.index-card__title strong { font-size: 12px; }
.index-card small { color: #718096; font-size: 9px; }
.index-card__value { display: block; margin: 7px 0 2px; font-size: 19px; font-weight: 700; }
.index-card > span:nth-child(3) { font-size: 11px; }
.index-card > span:nth-child(3) b { margin-left: 5px; }
.summary-grid { display: grid; grid-template-columns: 1.35fr repeat(4, 1fr); gap: 1px; overflow: hidden; border: 1px solid #1a2b42; border-radius: 9px; background: #1a2b42; }
.summary-grid > div { min-height: 74px; display: flex; flex-direction: column; justify-content: center; gap: 7px; padding: 11px 14px; background: #091525; }
.summary-grid small { color: #718096; font-size: 10px; }
.summary-grid strong { font-size: 14px; font-style: normal; }
.summary-grid i { font-style: normal; }
.summary-primary strong { font-size: 22px; }
.summary-primary span { font-size: 10px; }
.overview-main-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(420px, 1fr); gap: 14px; }
.heatmap-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.sector-search { max-width: 190px; }
.chart-summary { margin: 8px 0 0; color: #718096; font-size: 10px; }
.sector-list { max-height: 420px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; overflow: auto; }
.sector-list button {
  min-height: 52px; display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; align-items: center;
  padding: 8px; color: #f3f7fc; text-align: left; border: 1px solid #20334d; border-radius: 7px; background: #091525;
}
.sector-list button.is-selected { border-color: #3b82f6; }
.sector-list button > span:first-child { display: flex; flex-direction: column; }
.sector-list small { color: #718096; font-size: 9px; }
.sector-list button > span:last-child { grid-column: 1 / -1; color: #94a3b8; font-size: 10px; }
.top-stock-list { display: grid; gap: 7px; }
.top-stock-list article {
  display: grid; grid-template-columns: 28px minmax(90px, 1fr) .8fr .8fr 1.3fr 1.5fr auto;
  align-items: center; gap: 8px; padding: 9px; border: 1px solid #1a2b42; border-radius: 8px; background: #091525;
}
.top-stock-list .rank { width: 24px; height: 24px; display: grid; place-items: center; color: #60a5fa; border-radius: 6px; background: rgba(59,130,246,.12); font-size: 10px; }
.stock-name, .top-stock-list article > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.top-stock-list small { color: #718096; font-size: 9px; }
.top-stock-list b { overflow: hidden; text-overflow: ellipsis; font-size: 10px; white-space: nowrap; }
.monitor-link, .not-enabled { min-height: 30px; display: inline-flex; align-items: center; padding: 0 8px; border-radius: 6px; font-size: 9px; white-space: nowrap; }
.monitor-link { color: #bfdbfe; border: 1px solid #2563eb; background: rgba(37,99,235,.16); cursor: pointer; }
.not-enabled { color: #718096; border: 1px solid #20334d; }
.overview-bottom-grid { display: grid; grid-template-columns: minmax(480px, .85fr) minmax(0, 1.15fr); gap: 14px; }
.ranking-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.ranking-grid h3 { margin: 0 0 6px; color: #94a3b8; font-size: 10px; font-weight: 500; }
.ranking-grid button {
  width: 100%; min-height: 27px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 5px; color: #cbd5e1; border: 0; border-bottom: 1px solid rgba(32,51,77,.6); background: transparent; cursor: pointer; font-size: 10px;
}
.ranking-grid button:hover { background: #102039; }
.ranking-grid button span { display: flex; gap: 5px; }
.ranking-grid i { color: #5f718a; font-style: normal; }
.fund-types { margin-bottom: 3px; }
.mutation-list { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.mutation-list button {
  min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
  padding: 10px; color: #94a3b8; text-align: left; border: 1px solid #1a2b42; border-radius: 8px; background: #091525; cursor: pointer; font-size: 10px;
}
.mutation-list button:hover { border-color: #3b82f6; }
.mutation-list strong { color: #f3f7fc; font-size: 12px; }
.mutation-time { color: #5f718a; }
@media (max-width: 1199px) {
  .overview-main-grid, .overview-bottom-grid { grid-template-columns: 1fr; }
  .top-stock-list article { grid-template-columns: 28px 1fr repeat(2, .8fr) 1.3fr 1.4fr auto; }
}
@media (max-width: 1023px) {
  .index-grid { grid-template-columns: repeat(5, minmax(130px, 1fr)); overflow-x: auto; }
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .summary-primary { grid-column: 1 / -1; }
  .ranking-grid { grid-template-columns: repeat(2, 1fr); }
  .mutation-list { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 767px) {
  .overview-heading__note { display: none; }
  .index-grid { grid-template-columns: repeat(2, 1fr); overflow: visible; }
  .heatmap-toolbar { align-items: stretch; flex-direction: column; }
  .sector-search { max-width: none; }
  .sector-list { grid-template-columns: 1fr; }
  .top-stock-list article { grid-template-columns: 28px 1fr 1fr; }
  .top-stock-list article > div:nth-of-type(n+3) { display: none; }
  .ranking-grid, .mutation-list { grid-template-columns: 1fr; }
}
@media (max-width: 479px) {
  .index-grid, .summary-grid { grid-template-columns: 1fr; }
}
</style>
