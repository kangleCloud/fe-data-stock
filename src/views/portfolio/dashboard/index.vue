<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getPortfolioSummary } from "@/api/portfolio";
import BaseChart from "@/components/market/BaseChart.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import { useAuthStore } from "@/stores/auth";
import type { PortfolioDashboard } from "@/types/portfolio";
import { canAccess } from "@/utils/permission";
import {
  cutoffForDate,
  chartDataIndex,
  formatChartTick,
  errorText,
  formatMoney,
  formatPortfolioDateTime,
  localDate,
  statusNames,
} from "@/utils/portfolio";
import "@/styles/portfolio.css";
const router = useRouter();
const auth = useAuthStore();
const summary = ref<PortfolioDashboard>();
const loading = ref(false);
const error = ref("");
const date = ref("");
let epoch = 0;
async function load() {
  const own = ++epoch;
  loading.value = true;
  error.value = "";
  try {
    const data = await getPortfolioSummary(cutoffForDate(date.value));
    if (own === epoch) {
      summary.value = data;
    }
  } catch (caughtError) {
    if (own === epoch) {
      error.value = errorText(caughtError);
    }
  } finally {
    if (own === epoch) {
      loading.value = false;
    }
  }
}
onMounted(load);
const metrics = computed(() =>
  summary.value
    ? [
        { name: "剩余总成本", value: summary.value.totalCost },
        { name: "综合收益", value: summary.value.totalPnl },
        { name: "交易已实现盈亏", value: summary.value.totalRealizedPnl },
        { name: "公司行动现金收益", value: summary.value.actionCashIncome },
        { name: "手工估值市值", value: summary.value.totalMarketValue },
        { name: "浮动盈亏", value: summary.value.totalUnrealizedPnl },
      ]
    : [],
);
const costOption = computed(() => ({
  aria: {
    enabled: true,
    label: {
      description:
        summary.value?.costAllocation
          .map((item) => `${item.name}：${formatMoney(item.amount)}元`)
          .join("；") || "暂无成本数据",
    },
  },
  tooltip: {
    trigger: "item",
    renderMode: "richText",
    formatter: (params: unknown) => {
      const item = summary.value?.costAllocation[chartDataIndex(params)];
      return item ? `${item.name}\n${formatMoney(item.amount)} 元` : "—";
    },
  },
  series: [
    {
      type: "pie",
      radius: ["48%", "70%"],
      center: ["50%", "48%"],
      label: { formatter: "{b}" },
      data:
        summary.value?.costAllocation.map((item) => ({
          name: item.name,
          value: Number(item.amount),
        })) || [],
    },
  ],
}));
const chartIncome = computed(
  () => summary.value?.incomeItems.filter((item) => item.amount != null) || [],
);
const incomeOption = computed(() => ({
  aria: {
    enabled: true,
    label: {
      description:
        chartIncome.value
          .map((item) => `${item.name}：${formatMoney(item.amount)}元`)
          .join("；") || "暂无收益数据",
    },
  },
  tooltip: {
    trigger: "axis",
    renderMode: "richText",
    formatter: (params: unknown) => {
      const item = chartIncome.value[chartDataIndex(params)];
      return item ? `${item.name}\n${formatMoney(item.amount)} 元` : "—";
    },
  },
  grid: { left: 70, right: 20, top: 30, bottom: 50 },
  xAxis: {
    type: "category",
    data: chartIncome.value.map((x) => x.name),
  },
  yAxis: {
    type: "value",
    name: "元",
    axisLabel: { formatter: formatChartTick },
  },
  series: [
    {
      type: "bar",
      barMaxWidth: 48,
      data:
        chartIncome.value.map((x) => ({
          value: x.amount == null ? null : Number(x.amount),
          itemStyle: {
            color: x.amount?.startsWith("-") ? "#0f9f82" : "#dc2626",
          },
        })) || [],
    },
  ],
}));
const statusLabel = computed(
  () =>
    ({
      EMPTY: "空账本",
      COMPLETE: "核算完整",
      ESTIMATED: "含预估数据",
      INCOMPLETE: "数据不完整",
    })[summary.value?.status || ""] || "待加载",
);
function go(path: string, permission: string) {
  if (
    canAccess(auth.permissionCodes, permission) &&
    router.hasRoute(router.resolve(path).name || "")
  ) {
    void router.push(path);
  }
}
function isFutureDate(d: Date) {
  return (
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d) >
    localDate()
  );
}
</script>
<template>
  <section class="portfolio-page" v-loading="loading">
    <header class="portfolio-header">
      <div>
        <h1 class="page-title">持仓驾驶舱</h1>
        <p class="page-description">个人账本 · 手工估值 · 收益来源可追溯</p>
      </div>
      <div class="portfolio-inline">
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="当前 / 历史截止日"
          :disabled-date="isFutureDate"
        />
        <el-button @click="load">读取账本</el-button>
        <PortfolioTips
          title="核算与覆盖率"
          content="行情不参与核算。综合收益由交易盈亏、公司行动现金和手工估值浮盈构成。覆盖率表示同时具有估值与可靠成本的持有标的占比，不按市值加权。缺失或待核实部分不会填0，已知部分单独列示。"
        />
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="summary">
      <section class="page-panel portfolio-panel portfolio-header">
        <div>
          <el-tag
            :type="
              summary.status === 'COMPLETE'
                ? 'success'
                : summary.status === 'EMPTY'
                  ? 'info'
                  : 'warning'
            "
          >
            {{ statusLabel }}
          </el-tag>
          <span class="portfolio-muted">截止 {{ formatPortfolioDateTime(summary.asOf) }}（上海时间）</span>
          <p v-if="summary.message" class="page-description">
            {{ summary.message }}
          </p>
        </div>
        <div class="portfolio-inline">
          <span>
            持有 {{ summary.holdingCount }} / 全部 {{ summary.positionCount }}
          </span>
          <strong>
            覆盖率 {{ formatMoney(summary.valuationCoverageRate)
            }}{{ summary.valuationCoverageRate == null ? "" : "%" }}
          </strong>
        </div>
      </section>
      <div v-if="summary.status !== 'EMPTY'" class="portfolio-metrics">
        <article
          v-for="metric in metrics"
          :key="metric.name"
          class="page-panel portfolio-metric"
        >
          <span>{{ metric.name }} · 元</span>
          <strong
            :class="
              metric.value == null
                ? ''
                : metric.value.startsWith('-')
                  ? 'portfolio-negative'
                  : metric.name.includes('盈亏') || metric.name === '综合收益'
                    ? 'portfolio-positive'
                    : ''
            "
          >
            {{ formatMoney(metric.value) }}
          </strong>
          <small v-if="metric.value == null">缺少完整依据</small>
        </article>
      </div>
      <section
        v-if="
          summary.status === 'INCOMPLETE' &&
            (summary.partialMarketValue != null ||
              summary.partialUnrealizedPnl != null)
        "
        class="page-panel portfolio-panel"
      >
        <h2>
          已覆盖部分 · {{ summary.coveredHoldingCount }} /
          {{ summary.holdingCount }} 个持有标的
        </h2>
        <div class="portfolio-inline">
          <span>
            已覆盖部分市值 {{ formatMoney(summary.partialMarketValue) }} 元
          </span>
          <span>
            已覆盖部分浮盈 {{ formatMoney(summary.partialUnrealizedPnl) }} 元
          </span>
        </div>
        <p class="page-description">仅为已知部分，不代表账本完整总值。</p>
      </section>
      <section
        v-if="summary.status === 'EMPTY'"
        class="page-panel portfolio-panel"
      >
        <el-empty description="尚未建立个人账本">
          <el-button
            v-if="
              canAccess(auth.permissionCodes, 'portfolio:opening:add') &&
                canAccess(auth.permissionCodes, 'portfolio:position:view')
            "
            type="primary"
            @click="go('/portfolio/positions', 'portfolio:position:view')"
          >
            录入期初持仓
          </el-button>
          <el-button
            v-if="canAccess(auth.permissionCodes, 'portfolio:trade:view')"
            @click="go('/portfolio/trades', 'portfolio:trade:view')"
          >
            查看交易记录
          </el-button>
        </el-empty>
      </section>
      <template v-else>
        <section class="page-panel portfolio-panel">
          <h2>股票 / ETF 分类</h2>
          <el-table :data="summary.categories">
            <el-table-column prop="name" label="类别" />
            <el-table-column prop="holdingCount" label="持有标的" />
            <el-table-column label="成本（元）">
              <template #default="{ row }">
                {{ formatMoney(row.totalCost) }}
              </template>
            </el-table-column>
            <el-table-column label="市值（元）">
              <template #default="{ row }">
                {{ formatMoney(row.totalMarketValue) }}
                <small
                  v-if="
                    row.totalMarketValue == null &&
                      row.partialMarketValue != null
                  "
                  class="portfolio-muted"
                >
                  已知部分 {{ formatMoney(row.partialMarketValue) }}
                </small>
              </template>
            </el-table-column>
            <el-table-column label="综合收益（元）">
              <template #default="{ row }">
                {{ formatMoney(row.totalPnl) }}
              </template>
            </el-table-column>
            <el-table-column label="覆盖率">
              <template #default="{ row }">
                {{
                  row.valuationCoverageRate == null
                    ? "—"
                    : formatMoney(row.valuationCoverageRate) + "%"
                }}
              </template>
            </el-table-column>
          </el-table>
        </section>
        <div class="portfolio-charts">
          <section class="page-panel portfolio-panel">
            <h2>
              成本构成
              <small class="portfolio-muted">
                可靠已知成本 · 含预估项时按预估口径
              </small>
            </h2>
            <BaseChart
              v-if="
                summary.costAllocation.length &&
                  summary.costAllocation.some((x) => /[1-9]/.test(x.amount))
              "
              :option="costOption"
              accessible-label="可靠已知成本构成环图"
            />
            <el-empty v-else description="暂无可绘制的可靠成本" />
            <details>
              <summary>查看成本数据表</summary>
              <el-table :data="summary.costAllocation">
                <el-table-column prop="name" label="标的" />
                <el-table-column label="成本（元）">
                  <template #default="{ row }">
                    {{ formatMoney(row.amount) }}
                  </template>
                </el-table-column>
                <el-table-column label="核验">
                  <template #default="{ row }">
                    <PortfolioStatus :value="row.costStatus" />
                  </template>
                </el-table-column>
              </el-table>
            </details>
          </section>
          <section class="page-panel portfolio-panel">
            <h2>
              收益分项
              <small class="portfolio-muted">缺失项不绘制</small>
            </h2>
            <BaseChart
              v-if="summary.incomeItems.some((x) => x.amount != null)"
              :option="incomeOption"
              accessible-label="交易、公司行动现金与浮盈分项柱图"
            />
            <el-empty v-else description="暂无完整收益分项" />
            <details>
              <summary>查看收益及已知部分</summary>
              <el-table :data="summary.incomeItems">
                <el-table-column prop="name" label="分项" />
                <el-table-column label="完整金额（元）">
                  <template #default="{ row }">
                    {{ formatMoney(row.amount) }}
                  </template>
                </el-table-column>
                <el-table-column label="已知部分（元）">
                  <template #default="{ row }">
                    {{ formatMoney(row.partialAmount) }}
                  </template>
                </el-table-column>
                <el-table-column label="状态">
                  <template #default="{ row }">
                    {{
                      statusNames[row.status] ||
                        {
                          AVAILABLE: "可用",
                          MISSING: "缺少估值",
                          UNRELIABLE: "依据待核实",
                          EMPTY: "无数据",
                        }[row.status as string] ||
                        "待核实"
                    }}
                  </template>
                </el-table-column>
              </el-table>
            </details>
          </section>
        </div>
      </template>
      <section class="page-panel portfolio-panel">
        <div class="portfolio-header">
          <h2>最近有效交易</h2>
          <div>
            <el-button
              v-if="canAccess(auth.permissionCodes, 'portfolio:position:view')"
              link
              type="primary"
              @click="go('/portfolio/positions', 'portfolio:position:view')"
            >
              我的持仓
            </el-button>
            <el-button
              v-if="canAccess(auth.permissionCodes, 'portfolio:trade:view')"
              link
              @click="go('/portfolio/trades', 'portfolio:trade:view')"
            >
              全部交易
            </el-button>
          </div>
        </div>
        <el-table :data="summary.recentTrades" empty-text="暂无交易">
          <el-table-column prop="businessDate" label="日期" width="120" />
          <el-table-column prop="name" label="标的" />
          <el-table-column label="类型" width="85">
            <template #default="{ row }">
              {{ statusNames[row.tradeType] || row.tradeType }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" />
          <el-table-column label="成交金额（元）">
            <template #default="{ row }">
              {{ formatMoney(row.grossAmount) }}
            </template>
          </el-table-column>
          <el-table-column label="交易盈亏（元）">
            <template #default="{ row }">
              {{ formatMoney(row.finalPnl) }}
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>
    <el-empty v-else-if="!loading" description="未读取到账本">
      <el-button @click="load">重试</el-button>
    </el-empty>
  </section>
</template>
