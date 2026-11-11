<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getPortfolioSummary } from "@/api/portfolio";
import BaseChart from "@/components/market/BaseChart.vue";
import PositionDetailDrawer from "@/components/portfolio/PositionDetailDrawer.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { chartDataIndex, errorText, formatChartTick, formatMoney, formatTradeDate, signedMoney } from "@/utils/portfolio";
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
  try {
    const result = await getPortfolioSummary();
    if (own === epoch) summary.value = result;
  } catch (caughtError) {
    if (own === epoch) error.value = errorText(caughtError);
  } finally {
    if (own === epoch) busy.value = false;
  }
}

onMounted(load);
const canView = computed(() => canAccess(auth.permissionCodes, "portfolio:position:view"));
const metrics = computed(() => summary.value
  ? [
      { name: "总成本", value: summary.value.totalCost },
      { name: "总市值", value: summary.value.totalMarketValue },
      { name: "持仓浮动盈亏", value: summary.value.totalUnrealizedPnl },
    ]
  : []);
const positions = computed(() => summary.value?.positions || []);
const distribution = computed(() => positions.value.filter((item) =>
  item.quantity > 0 && item.marketValue != null && /[1-9]/.test(item.marketValue)));
const distributionOption = computed(() => ({
  aria: { enabled: true, label: { description: distribution.value.map((item) => `${item.nameSnapshot}：${formatMoney(item.marketValue)}元`).join("；") } },
  tooltip: {
    trigger: "item",
    confine: true,
    renderMode: "richText",
    formatter: (params: unknown) => {
      const item = distribution.value[chartDataIndex(params)];
      return item ? `${item.nameSnapshot}\n总市值：${formatMoney(item.marketValue)} 元` : "—";
    },
  },
  series: [{ type: "pie", radius: ["42%", "68%"], data: distribution.value.map((item) => ({ name: item.nameSnapshot, value: Number(item.marketValue) })) }],
}));
const incomeOption = computed(() => ({
  aria: { enabled: true, label: { description: positions.value.map((item) => `${item.nameSnapshot}：持仓浮动盈亏${signedMoney(item.unrealizedPnl)}元`).join("；") } },
  tooltip: {
    trigger: "axis",
    confine: true,
    renderMode: "richText",
    formatter: (params: unknown) => {
      const item = positions.value[chartDataIndex(params)];
      return item ? `${item.nameSnapshot}\n持仓浮动盈亏：${signedMoney(item.unrealizedPnl)} 元\n记录日：${formatTradeDate(item.tradeDate)}` : "—";
    },
  },
  grid: { left: 12, right: 20, top: 30, bottom: 20, containLabel: true },
  xAxis: { type: "category", data: positions.value.map((item) => item.nameSnapshot), axisLabel: { hideOverlap: true } },
  yAxis: { type: "value", name: "元", axisLabel: { formatter: formatChartTick } },
  series: [{
    type: "bar",
    barMaxWidth: 32,
    data: positions.value.map((item) => ({
      value: Number(item.unrealizedPnl),
      itemStyle: { color: item.unrealizedPnl.startsWith("-") ? "#0f9f82" : "#dc2626" },
    })),
  }],
}));

function detail(id: EntityId) {
  selected.value = id;
  opened.value = true;
}
</script>
<template>
  <section v-loading="busy" class="portfolio-page">
    <header class="portfolio-header">
      <div>
        <h1 class="page-title">持仓驾驶舱</h1>
        <p class="page-description">最新收盘记录 · 人工总额 · 非实时行情</p>
      </div>
      <div class="portfolio-inline">
        <el-button @click="load">读取持仓</el-button>
        <el-button v-if="canView" type="primary" @click="router.push('/portfolio/positions')">维护我的持仓</el-button>
        <PortfolioTips
          title="汇总口径"
          content="汇总所有标的最新记录；持仓浮动盈亏=人工总市值−人工总成本，不是券商当日盈亏，也不读取实时行情。各持仓记录日可能不同。"
        />
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="summary">
      <section class="page-panel portfolio-panel">
        <h2>最新收盘汇总</h2>
        <div class="portfolio-inline">
          <span>全部标的 {{ summary.positionCount }}</span>
          <span>有持仓 {{ summary.holdingCount }}</span>
        </div>
      </section>
      <div class="portfolio-metrics">
        <article v-for="metric in metrics" :key="metric.name" class="page-panel portfolio-metric">
          <span>{{ metric.name }}（元）</span>
          <strong>{{ metric.name === '持仓浮动盈亏' ? signedMoney(metric.value) : formatMoney(metric.value) }}</strong>
        </article>
      </div>
      <el-empty v-if="!summary.positionCount" description="尚无持仓，请先录入收盘记录" />
      <template v-else>
        <section class="page-panel portfolio-panel">
          <h2>股票 / ETF 分类</h2>
          <el-table :data="summary.categories">
            <el-table-column prop="name" label="类别" />
            <el-table-column prop="holdingCount" label="有持仓" />
            <el-table-column label="总成本（元）" align="right">
              <template #default="{ row }">{{ formatMoney(row.totalCost) }}</template>
            </el-table-column>
            <el-table-column label="总市值（元）" align="right">
              <template #default="{ row }">{{ formatMoney(row.totalMarketValue) }}</template>
            </el-table-column>
            <el-table-column label="持仓浮动盈亏（元）" align="right">
              <template #default="{ row }">{{ signedMoney(row.totalUnrealizedPnl) }}</template>
            </el-table-column>
          </el-table>
        </section>
        <div class="portfolio-charts">
          <section class="page-panel portfolio-panel">
            <h2>最新持仓市值分布</h2>
            <BaseChart v-if="distribution.length" :option="distributionOption" accessible-label="当前持有标的的市值分布" />
            <el-empty v-else description="暂无可绘制的市值" />
          </section>
          <section class="page-panel portfolio-panel">
            <h2>逐个持仓浮动盈亏</h2>
            <BaseChart v-if="positions.length" :option="incomeOption" accessible-label="逐个持仓浮动盈亏条图" />
            <el-empty v-else description="暂无持仓盈亏" />
          </section>
        </div>
        <section class="page-panel portfolio-panel">
          <h2>各持仓最新收盘记录</h2>
          <el-table :data="summary.positions">
            <el-table-column prop="nameSnapshot" label="标的" min-width="140" />
            <el-table-column prop="quantity" label="数量" width="85" />
            <el-table-column label="总市值（元）" align="right" min-width="130">
              <template #default="{ row }">{{ formatMoney(row.marketValue) }}</template>
            </el-table-column>
            <el-table-column label="总成本（元）" align="right" min-width="130">
              <template #default="{ row }">{{ formatMoney(row.totalCost) }}</template>
            </el-table-column>
            <el-table-column label="持仓浮动盈亏（元）" align="right" min-width="175">
              <template #default="{ row }">{{ signedMoney(row.unrealizedPnl) }}</template>
            </el-table-column>
            <el-table-column label="最新记录日" min-width="125">
              <template #default="{ row }">{{ formatTradeDate(row.tradeDate) }}</template>
            </el-table-column>
            <el-table-column v-if="canView" label="操作" width="100">
              <template #default="{ row }">
                <el-button link @click="detail(row.id)">查看详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </template>
    <PositionDetailDrawer v-if="canView" v-model="opened" :id="selected" @changed="load" />
  </section>
</template>
