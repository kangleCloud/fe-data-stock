<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { audits, getPortfolioPositionDetail } from "@/api/portfolio";
import BaseChart from "@/components/market/BaseChart.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import DailyEntryDrawer from "@/components/portfolio/DailyEntryDrawer.vue";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { chartDataIndex, errorText, formatChartTick, formatMoney, formatTradeDate, signedMoney } from "@/utils/portfolio";
import type { EntityId } from "@/types/api";
import type { PortfolioAudit, PortfolioPositionDetail } from "@/types/portfolio";

const props = defineProps<{ modelValue: boolean; id?: EntityId }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; changed: [] }>();
const opened = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) });
const auth = useAuthStore();
const canUpdate = computed(() => canAccess(auth.permissionCodes, "portfolio:position:update"));
const canAudit = computed(() => canAccess(auth.permissionCodes, "portfolio:audit:view"));

const detail = ref<PortfolioPositionDetail>();
const auditRows = ref<PortfolioAudit[]>([]);
const busy = ref(false);
const error = ref("");
const activeTab = ref("history");
const recording = ref(false);
let epoch = 0;

const records = computed(() => detail.value?.records || []);
const displayRecords = computed(() => [...records.value].reverse());
const auditOperationName = (operation: string) => operation === "SAVE" ? "保存" : operation;

async function load() {
  if (props.id == null) return;
  const own = ++epoch;
  busy.value = true;
  error.value = "";
  try {
    const result = await getPortfolioPositionDetail(props.id);
    if (own !== epoch) return;
    detail.value = result;
    if (canAudit.value) {
      const rows = await audits.list({ positionId: props.id });
      if (own === epoch) auditRows.value = rows;
    }
  } catch (caughtError) {
    if (own === epoch) error.value = errorText(caughtError);
  } finally {
    if (own === epoch) busy.value = false;
  }
}

watch(
  () => [props.modelValue, props.id],
  () => {
    epoch++;
    if (!props.modelValue) return;
    detail.value = undefined;
    auditRows.value = [];
    activeTab.value = "history";
    recording.value = false;
    void load();
  },
  { immediate: true },
);

const option = computed(() => ({
  aria: {
    enabled: true,
    label: {
      description: records.value
        .map((item) => `${formatTradeDate(item.tradeDate)}：持仓浮动盈亏${signedMoney(item.unrealizedPnl)}元`)
        .join("；"),
    },
  },
  grid: { left: 12, right: 24, top: 38, bottom: 18, containLabel: true },
  tooltip: {
    trigger: "axis",
    confine: true,
    renderMode: "richText",
    formatter: (params: unknown) => {
      const item = records.value[chartDataIndex(params)];
      return item
        ? `${formatTradeDate(item.tradeDate)}\n持仓浮动盈亏：${signedMoney(item.unrealizedPnl)} 元\n持仓数量：${item.quantity}\n总成本：${formatMoney(item.totalCost)} 元\n总市值：${formatMoney(item.marketValue)} 元`
        : "—";
    },
  },
  xAxis: {
    type: "category",
    data: records.value.map((item) => formatTradeDate(item.tradeDate)),
    boundaryGap: records.value.length === 1,
    axisLabel: { interval: "auto", hideOverlap: true },
  },
  yAxis: {
    type: "value",
    name: "元",
    axisLabel: { formatter: formatChartTick },
    min: (extent: { min: number; max: number }) => extent.min === 0 && extent.max === 0 ? -1 : Math.min(0, extent.min),
    max: (extent: { min: number; max: number }) => extent.min === 0 && extent.max === 0 ? 1 : Math.max(0, extent.max),
  },
  visualMap: {
    show: false,
    dimension: 1,
    pieces: [
      { gt: 0, color: "#dc2626" },
      { lt: 0, color: "#0f9f82" },
      { value: 0, color: "#64748b" },
    ],
  },
  series: [{
    type: "line",
    smooth: false,
    connectNulls: false,
    showSymbol: true,
    symbolSize: 7,
    lineStyle: { width: 2 },
    data: records.value.map((item) => Number(item.unrealizedPnl)),
    markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ yAxis: 0 }] },
  }],
}));

function record() {
  recording.value = true;
}

async function saved() {
  await load();
  emit("changed");
}
</script>
<template>
  <el-drawer v-model="opened" class="portfolio-drawer" title="持仓详情与收盘记录" size="900px">
    <div v-loading="busy">
      <el-alert v-if="error" :title="error" type="warning" :closable="false" />
      <template v-if="detail">
        <header class="portfolio-header">
          <h2>{{ detail.position.nameSnapshot }} <small>{{ detail.position.symbol }}</small></h2>
          <PortfolioTips
            title="记录口径"
            content="按记录日展示收盘数据；平均成本、参考价和浮动盈亏由人工总额计算，不是实时行情。历史可回补，录错后重选日期保存即覆盖当日记录。"
          />
        </header>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="最新记录日">{{ formatTradeDate(detail.position.tradeDate) }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ detail.position.quantity }}</el-descriptions-item>
          <el-descriptions-item label="总成本（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.position.totalCost) }}</el-descriptions-item>
          <el-descriptions-item label="总市值（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.position.marketValue) }}</el-descriptions-item>
          <el-descriptions-item label="平均成本（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.position.averageCost) }}</el-descriptions-item>
          <el-descriptions-item label="参考价格（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.position.referencePrice) }}</el-descriptions-item>
          <el-descriptions-item label="持仓浮动盈亏（元）" class-name="portfolio-metric-value">{{ signedMoney(detail.position.unrealizedPnl) }}</el-descriptions-item>
          <el-descriptions-item label="浮动盈亏率" class-name="portfolio-metric-value">{{ detail.position.unrealizedRate == null ? '—' : formatMoney(detail.position.unrealizedRate) + '%' }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="canUpdate" class="portfolio-toolbar portfolio-section-gap">
          <el-button type="primary" @click="record">记录持仓</el-button>
        </div>
        <el-tabs v-model="activeTab">
          <el-tab-pane label="盈亏折线与历史" name="history">
            <h3>持仓浮动盈亏</h3>
            <BaseChart v-if="records.length" :option="option" accessible-label="按记录日的持仓浮动盈亏折线" height="280px" />
            <el-empty v-else description="暂无收盘记录" />
            <details open>
              <summary>查看收盘记录数据表（历史只读）</summary>
              <el-table :data="displayRecords" empty-text="暂无记录">
                <el-table-column label="记录日" min-width="120"><template #default="{ row }">{{ formatTradeDate(row.tradeDate) }}</template></el-table-column>
                <el-table-column prop="quantity" label="数量" width="90" />
                <el-table-column label="总市值" align="right" min-width="130"><template #default="{ row }">{{ formatMoney(row.marketValue) }}</template></el-table-column>
                <el-table-column label="总成本" align="right" min-width="130"><template #default="{ row }">{{ formatMoney(row.totalCost) }}</template></el-table-column>
                <el-table-column label="持仓浮动盈亏" align="right" min-width="145"><template #default="{ row }">{{ signedMoney(row.unrealizedPnl) }}</template></el-table-column>
                <el-table-column label="盈亏率" align="right" min-width="110"><template #default="{ row }">{{ row.unrealizedRate == null ? '—' : formatMoney(row.unrealizedRate) + '%' }}</template></el-table-column>
                <el-table-column prop="remark" label="备注" min-width="140" />
              </el-table>
            </details>
          </el-tab-pane>
          <el-tab-pane v-if="canAudit" label="操作审计" name="audit">
            <el-table :data="auditRows">
              <el-table-column label="操作" width="100"><template #default="{ row }">{{ auditOperationName(row.operation) }}</template></el-table-column>
              <el-table-column prop="operationReason" label="原因" />
              <el-table-column label="原始记录">
                <template #default="{ row }">
                  <el-popover trigger="click" width="480">
                    <template #reference><el-button link>查看前后数据</el-button></template>
                    <pre class="portfolio-json">{{ row.beforeData || '—' }}</pre>
                    <pre class="portfolio-json">{{ row.afterData || '—' }}</pre>
                  </el-popover>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
    <DailyEntryDrawer
      v-if="detail && canUpdate"
      v-model="recording"
      :position="detail.position"
      @saved="saved"
    />
  </el-drawer>
</template>
