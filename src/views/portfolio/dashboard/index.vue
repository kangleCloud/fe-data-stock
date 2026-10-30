<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getPortfolioSummary } from "@/api/portfolio";
import BaseChart from "@/components/market/BaseChart.vue";
import PositionDrawer from "@/components/portfolio/PositionDrawer.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { chartDataIndex, errorText, formatChartTick, formatMoney, formatPortfolioDateTime, signedMoney } from "@/utils/portfolio";
import type { PortfolioDashboard } from "@/types/portfolio";
import type { EntityId } from "@/types/api";
import "@/styles/portfolio.css";
const auth = useAuthStore();
const router = useRouter();
const summary = ref<PortfolioDashboard>();
const busy = ref(false);
const error = ref("");
const selected = ref<EntityId>();
const opened = ref(false);
let epoch = 0;
async function load() {
  const own = ++epoch;
  busy.value = true;
  error.value = "";
  try { const result = await getPortfolioSummary(); if (own === epoch) summary.value = result; }
  catch (caughtError) { if (own === epoch) error.value = errorText(caughtError); }
  finally { if (own === epoch) busy.value = false; }
}
onMounted(load);
const canView = computed(() => canAccess(auth.permissionCodes, "portfolio:position:view"));
const metrics = computed(() => summary.value ? [{ name: "总成本", value: summary.value.totalCost }, { name: "总市值", value: summary.value.totalMarketValue }, { name: "持仓浮动盈亏", value: summary.value.totalUnrealizedPnl }] : []);
const complete = computed(() => summary.value?.positions.filter((item) => item.snapshotComplete) || []);
const distribution = computed(() => complete.value.filter((item) => item.currentQuantity > 0 && item.marketValue != null && /[1-9]/.test(item.marketValue)));
const distributionOption = computed(() => ({
  aria: { enabled: true, label: { description: distribution.value.map((item) => `${item.nameSnapshot}：${formatMoney(item.marketValue)}元`).join("；") } },
  tooltip: { trigger: "item", confine: true, renderMode: "richText", formatter: (params: unknown) => { const item = distribution.value[chartDataIndex(params)]; return item ? `${item.nameSnapshot}\n总市值：${formatMoney(item.marketValue)} 元` : "—"; } },
  series: [{ type: "pie", radius: ["42%", "68%"], data: distribution.value.map((item) => ({ name: item.nameSnapshot, value: Number(item.marketValue) })) }],
}));
const incomeOption = computed(() => ({
  aria: { enabled: true, label: { description: complete.value.map((item) => `${item.nameSnapshot}：持仓浮动盈亏${signedMoney(item.unrealizedPnl)}元`).join("；") } },
  tooltip: { trigger: "axis", confine: true, renderMode: "richText", formatter: (params: unknown) => { const item = complete.value[chartDataIndex(params)]; return item ? `${item.nameSnapshot}\n持仓浮动盈亏：${signedMoney(item.unrealizedPnl)} 元\n快照时点：${formatPortfolioDateTime(item.snapshotAt)}` : "—"; } },
  grid: { left: 12, right: 20, top: 30, bottom: 20, containLabel: true },
  xAxis: { type: "category", data: complete.value.map((item) => item.nameSnapshot), axisLabel: { hideOverlap: true } },
  yAxis: { type: "value", name: "元", axisLabel: { formatter: formatChartTick } },
  series: [{ type: "bar", barMaxWidth: 32, data: complete.value.map((item) => ({ value: item.unrealizedPnl == null ? null : Number(item.unrealizedPnl), itemStyle: { color: item.unrealizedPnl?.startsWith("-") ? "#0f9f82" : "#dc2626" } })) }],
}));
function detail(id: EntityId) { selected.value = id; opened.value = true; }
</script>
<template>
  <section class="portfolio-page" v-loading="busy">
    <header class="portfolio-header"><div><h1 class="page-title">持仓驾驶舱</h1><p class="page-description">个人持仓 · 人工完整快照 · 非自动行情</p></div><div class="portfolio-inline"><el-button @click="load">读取持仓</el-button><el-button v-if="canView" type="primary" @click="router.push('/portfolio/positions')">维护我的持仓</el-button><PortfolioTips title="汇总口径" content="只汇总已完整录入的最新快照，待首次完整录入的身份不计入金额。持仓浮动盈亏=人工总市值−人工总成本，不是券商当日盈亏，也不读取Redis报价；买卖类型仅记录说明，不核算成交、费用或已实现盈亏。各持仓时点可能不同。" /></div></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="summary">
      <section class="page-panel portfolio-panel"><h2>已完整录入持仓汇总</h2><div class="portfolio-inline"><span>全部身份 {{ summary.positionCount }}</span><span>有持仓 {{ summary.holdingCount }}</span><span>已完整录入 {{ summary.completePositionCount }}</span><span>待首次完整录入 {{ summary.pendingPositionCount }}</span></div></section>
      <div class="portfolio-metrics"><article v-for="metric in metrics" :key="metric.name" class="page-panel portfolio-metric"><span>{{ metric.name }}（元）</span><strong>{{ metric.name === '持仓浮动盈亏' ? signedMoney(metric.value) : formatMoney(metric.value) }}</strong></article></div>
      <el-alert v-if="summary.pendingPositionCount" title="存在待首次完整录入的持仓，以下金额只代表已完整部分，不是全部资产总值" type="info" :closable="false" />
      <el-empty v-if="!summary.positionCount" description="尚无持仓，请先录入完整快照" />
      <template v-else>
        <section class="page-panel portfolio-panel"><h2>股票 / ETF 分类</h2><el-table :data="summary.categories"><el-table-column prop="name" label="类别" /><el-table-column prop="holdingCount" label="有持仓" /><el-table-column prop="completePositionCount" label="完整录入" /><el-table-column prop="pendingPositionCount" label="待补录" /><el-table-column label="总成本（元）" align="right"><template #default="{ row }">{{ formatMoney(row.totalCost) }}</template></el-table-column><el-table-column label="总市值（元）" align="right"><template #default="{ row }">{{ formatMoney(row.totalMarketValue) }}</template></el-table-column><el-table-column label="持仓浮动盈亏（元）" align="right"><template #default="{ row }">{{ signedMoney(row.totalUnrealizedPnl) }}</template></el-table-column></el-table></section>
        <div class="portfolio-charts"><section class="page-panel portfolio-panel"><h2>已完整录入持仓市值分布</h2><BaseChart v-if="distribution.length" :option="distributionOption" accessible-label="已完整录入且当前持有的市值分布" /><el-empty v-else description="暂无可绘制的完整市值" /></section><section class="page-panel portfolio-panel"><h2>逐个持仓浮动盈亏</h2><BaseChart v-if="complete.length" :option="incomeOption" accessible-label="完整持仓浮动盈亏条图" /><el-empty v-else description="暂无完整持仓盈亏" /></section></div>
        <section class="page-panel portfolio-panel"><h2>各持仓最新快照</h2><el-table :data="summary.positions"><el-table-column prop="nameSnapshot" label="标的" min-width="140" /><el-table-column prop="currentQuantity" label="数量" width="85" /><el-table-column label="总市值（元）" align="right" min-width="130"><template #default="{ row }">{{ formatMoney(row.marketValue) }}</template></el-table-column><el-table-column label="总成本（元）" align="right" min-width="130"><template #default="{ row }">{{ formatMoney(row.totalCost) }}</template></el-table-column><el-table-column label="持仓浮动盈亏（元）" align="right" min-width="175"><template #default="{ row }">{{ signedMoney(row.unrealizedPnl) }}</template></el-table-column><el-table-column label="最新快照时点" min-width="175"><template #default="{ row }">{{ row.snapshotComplete ? formatPortfolioDateTime(row.snapshotAt) : '待首次完整录入' }}</template></el-table-column><el-table-column v-if="canView" label="操作" width="100"><template #default="{ row }"><el-button link @click="detail(row.id)">查看详情</el-button></template></el-table-column></el-table></section>
      </template>
    </template>
    <PositionDrawer v-if="canView" v-model="opened" :id="selected" @changed="load" />
  </section>
</template>
