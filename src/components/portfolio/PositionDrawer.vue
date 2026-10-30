<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { audits, getPortfolioAnalysis } from "@/api/portfolio";
import BaseChart from "@/components/market/BaseChart.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import SnapshotDrawer from "@/components/portfolio/SnapshotDrawer.vue";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { chartDataIndex, errorText, formatChartTick, formatMoney, formatPortfolioDateTime, operationNames, signedMoney } from "@/utils/portfolio";
import type { EntityId } from "@/types/api";
import type { PortfolioAudit, PortfolioPositionAnalysis, SnapshotOperation } from "@/types/portfolio";
const props = defineProps<{ modelValue: boolean; id?: EntityId }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; changed: [] }>();
const opened = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) });
const auth = useAuthStore();
const canUpdate = computed(() => canAccess(auth.permissionCodes, "portfolio:position:update"));
const canAudit = computed(() => canAccess(auth.permissionCodes, "portfolio:audit:view"));
const analysis = ref<PortfolioPositionAnalysis>();
const detail = computed(() => analysis.value?.position);
// 使用后端时点与ID顺序；不补点，也不套用行情监控的断线阈值。
const records = computed(() => analysis.value?.snapshots || []);
const auditRows = ref<PortfolioAudit[]>([]);
const busy = ref(false);
const error = ref("");
const activeTab = ref("history");
const recording = ref(false);
const operation = ref<SnapshotOperation>("ADJUST");
let epoch = 0;
async function load() {
  if (props.id == null) return;
  const own = ++epoch;
  busy.value = true;
  error.value = "";
  try {
    const result = await getPortfolioAnalysis(props.id);
    if (own !== epoch) return;
    analysis.value = result;
    if (canAudit.value) {
      const auditResult = await audits.list({ positionId: props.id });
      if (own === epoch) auditRows.value = auditResult;
    }
  } catch (caughtError) { if (own === epoch) error.value = errorText(caughtError); }
  finally { if (own === epoch) busy.value = false; }
}
watch(() => [props.modelValue, props.id], () => {
  epoch++;
  if (!props.modelValue) return;
  analysis.value = undefined;
  auditRows.value = [];
  activeTab.value = "history";
  recording.value = false;
  void load();
}, { immediate: true });
const option = computed(() => ({
  aria: { enabled: true, label: { description: records.value.map((item) => `${formatPortfolioDateTime(item.snapshotAt)} ${operationNames[item.operationType]}：持仓浮动盈亏${signedMoney(item.unrealizedPnl)}元`).join("；") } },
  grid: { left: 12, right: 24, top: 38, bottom: 18, containLabel: true },
  tooltip: { trigger: "axis", confine: true, renderMode: "richText", formatter: (params: unknown) => {
    const item = records.value[chartDataIndex(params)];
    return item ? `${formatPortfolioDateTime(item.snapshotAt)} · ${operationNames[item.operationType]}\n持仓浮动盈亏：${signedMoney(item.unrealizedPnl)} 元\n持仓数量：${item.quantity}\n总成本：${formatMoney(item.totalCost)} 元\n总市值：${formatMoney(item.marketValue)} 元` : "—";
  } },
  xAxis: { type: "category", data: records.value.map((item) => formatPortfolioDateTime(item.snapshotAt)), boundaryGap: records.value.length === 1, axisLabel: { interval: "auto", hideOverlap: true, formatter: (value: string) => value.replace(" ", "\n") } },
  yAxis: { type: "value", name: "元", axisLabel: { formatter: formatChartTick }, min: (extent: { min: number; max: number }) => extent.min === 0 && extent.max === 0 ? -1 : Math.min(0, extent.min), max: (extent: { min: number; max: number }) => extent.min === 0 && extent.max === 0 ? 1 : Math.max(0, extent.max) },
  visualMap: { show: false, dimension: 1, pieces: [{ gt: 0, color: "#dc2626" }, { lt: 0, color: "#0f9f82" }, { value: 0, color: "#64748b" }] },
  series: [{ type: "line", smooth: false, connectNulls: false, showSymbol: true, symbolSize: 7, lineStyle: { width: 2 }, data: records.value.map((item) => Number(item.unrealizedPnl)), markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ yAxis: 0 }] } }],
}));
function record(type: SnapshotOperation) { operation.value = type; recording.value = true; }
async function saved() { await load(); emit("changed"); }
</script>
<template>
  <el-drawer v-model="opened" class="portfolio-drawer" title="持仓详情与快照历史" size="900px">
    <div v-loading="busy">
      <el-alert v-if="error" :title="error" type="warning" :closable="false" />
      <template v-if="detail">
        <header class="portfolio-header"><h2>{{ detail.nameSnapshot }} <small>{{ detail.symbol }}</small></h2><PortfolioTips title="快照口径" content="价格、平均成本和浮动盈亏由人工录入的总额计算，不是自动行情或当日盈亏。折线只连接真实人工快照，不补点、不重放交易；历史只读，录错请新增调整快照。" /></header>
        <el-alert v-if="!detail.snapshotComplete" title="待首次完整录入：原数量和成本仅供参考，暂无真实快照与盈亏" type="info" :closable="false" />
        <el-descriptions :column="2" border>
          <el-descriptions-item label="最新快照时点">{{ formatPortfolioDateTime(detail.snapshotAt) }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ detail.currentQuantity }}</el-descriptions-item>
          <el-descriptions-item label="总成本（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.totalCost) }}</el-descriptions-item>
          <el-descriptions-item label="总市值（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.marketValue) }}</el-descriptions-item>
          <el-descriptions-item label="平均成本（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.averageCost) }}</el-descriptions-item>
          <el-descriptions-item label="参考价格（元）" class-name="portfolio-metric-value">{{ formatMoney(detail.referencePrice) }}</el-descriptions-item>
          <el-descriptions-item label="持仓浮动盈亏（元）" class-name="portfolio-metric-value">{{ signedMoney(detail.unrealizedPnl) }}</el-descriptions-item>
          <el-descriptions-item label="浮动盈亏率" class-name="portfolio-metric-value">{{ detail.unrealizedRate == null ? '—' : formatMoney(detail.unrealizedRate) + '%' }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="canUpdate" class="portfolio-toolbar portfolio-section-gap">
          <el-button @click="record('BUY')">记录买入后持仓</el-button><el-button @click="record('SELL')">记录卖出后持仓</el-button><el-button @click="record(detail.snapshotComplete ? 'ADJUST' : 'INITIAL')">{{ detail.snapshotComplete ? '调整持仓' : '首次完整录入' }}</el-button>
        </div>
        <el-tabs v-model="activeTab">
          <el-tab-pane label="盈亏折线与历史" name="history">
            <h3>持仓浮动盈亏</h3>
            <BaseChart v-if="records.length" :option="option" accessible-label="按人工快照时点的持仓浮动盈亏折线" height="280px" />
            <el-empty v-else description="暂无真实快照，首次完整录入后形成历史" />
            <details open>
              <summary>查看人工快照数据表（历史只读）</summary>
              <el-table :data="records" empty-text="暂无快照">
                <el-table-column label="时点（上海时间）" min-width="175"><template #default="{ row }">{{ formatPortfolioDateTime(row.snapshotAt) }}</template></el-table-column>
                <el-table-column label="记录类型" min-width="110"><template #default="{ row }">{{ operationNames[row.operationType] || row.operationType }}</template></el-table-column>
                <el-table-column prop="quantity" label="数量" width="90" />
                <el-table-column label="总市值" align="right" min-width="130"><template #default="{ row }">{{ formatMoney(row.marketValue) }}</template></el-table-column>
                <el-table-column label="总成本" align="right" min-width="130"><template #default="{ row }">{{ formatMoney(row.totalCost) }}</template></el-table-column>
                <el-table-column label="持仓浮动盈亏" align="right" min-width="145"><template #default="{ row }">{{ signedMoney(row.unrealizedPnl) }}</template></el-table-column>
                <el-table-column label="盈亏率" align="right" min-width="110"><template #default="{ row }">{{ row.unrealizedRate == null ? '—' : formatMoney(row.unrealizedRate) + '%' }}</template></el-table-column>
                <el-table-column prop="remark" label="备注" min-width="140" />
              </el-table>
            </details>
          </el-tab-pane>
          <el-tab-pane v-if="canAudit" label="操作审计" name="audit"><el-table :data="auditRows"><el-table-column prop="operation" label="操作" /><el-table-column prop="operationReason" label="原因" /><el-table-column label="原始记录"><template #default="{ row }"><el-popover trigger="click" width="480"><template #reference><el-button link>查看前后数据</el-button></template><pre class="portfolio-json">{{ row.beforeData || '—' }}</pre><pre class="portfolio-json">{{ row.afterData || '—' }}</pre></el-popover></template></el-table-column></el-table></el-tab-pane>
        </el-tabs>
      </template>
    </div>
    <SnapshotDrawer v-if="detail && canUpdate" v-model="recording" :position="detail" :operation="operation" @saved="saved" />
  </el-drawer>
</template>
