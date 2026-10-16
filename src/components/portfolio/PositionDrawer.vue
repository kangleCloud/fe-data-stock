<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  audits,
  getPortfolioAnalysis,
  positions,
  valuations,
} from "@/api/portfolio";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import UncertainResultNotice from "@/components/portfolio/UncertainResultNotice.vue";
import TradeDrawer from "@/components/portfolio/TradeDrawer.vue";
import BaseChart from "@/components/market/BaseChart.vue";
import { useAuthStore } from "@/stores/auth";
import type { EntityId } from "@/types/api";
import type {
  PortfolioAudit,
  PortfolioPosition,
  PortfolioPositionAnalysis,
  PortfolioValuation,
} from "@/types/portfolio";
import { canAccess } from "@/utils/permission";
import {
  priceInputValid,
  errorText,
  formatMoney,
  chartDataIndex,
  formatChartTick,
  writeErrorText,
  isUncertainWrite,
} from "@/utils/portfolio";
const props = defineProps<{
  modelValue: boolean;
  id?: string | number;
  asOf?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean]; changed: [] }>();
const opened = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});
const auth = useAuthStore();
const can = (p: string) => canAccess(auth.permissionCodes, p);
const detail = ref<PortfolioPosition>();
const analysis = ref<PortfolioPositionAnalysis>();
const valuationRows = ref<PortfolioValuation[]>([]);
const auditRows = ref<PortfolioAudit[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const uncertain = ref(false);
const checked = ref(false);
const verificationRows = ref<
  Array<{ id: EntityId; at: string; label: string; amount: string }>
>([]);
const valuationAt = ref("");
const valuationPrice = ref("");
const replacement = ref<PortfolioValuation>();
const reason = ref("");
const remark = ref("");
const tradeOpen = ref(false);
const tradeKind = ref<"BUY" | "SELL" | "OPENING">("BUY");
async function load() {
  if (props.id == null) {
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    detail.value = props.asOf
      ? await positions.history(props.id, props.asOf)
      : await positions.get(props.id);
    analysis.value = await getPortfolioAnalysis(props.id, props.asOf);
    if (can("portfolio:valuation:view")) {
      valuationRows.value = await valuations.list({
        positionId: props.id,
        asOf: props.asOf,
      });
    }
    if (can("portfolio:audit:view")) {
      auditRows.value = await audits.list({ positionId: props.id });
    }
  } catch (caughtError) {
    error.value = errorText(caughtError);
  } finally {
    loading.value = false;
  }
}
watch(
  () => [props.modelValue, props.id, props.asOf],
  () => {
    if (props.modelValue) {
      uncertain.value = false;
      checked.value = false;
      verificationRows.value = [];
      replacement.value = undefined;
      valuationAt.value = "";
      valuationPrice.value = "";
      remark.value = "";
      reason.value = "";
      void load();
    }
  },
  { immediate: true },
);
const costOption = computed(() => ({
  aria: {
    enabled: true,
    label: {
      description:
        analysis.value?.costEntries
          .map(
            (entry) =>
              `${entry.businessDate}序号${entry.entrySeq}：成本变动${formatMoney(entry.costDelta)}元`,
          )
          .join("；") || "暂无成本变动数据",
    },
  },
  tooltip: {
    trigger: "axis",
    renderMode: "richText",
    formatter: (params: unknown) => {
      const entry = analysis.value?.costEntries[chartDataIndex(params)];
      return entry
        ? `${entry.businessDate} #${entry.entrySeq}\n${formatMoney(entry.costDelta)} 元`
        : "—";
    },
  },
  grid: { left: 65, right: 20, top: 20, bottom: 70 },
  xAxis: {
    type: "category",
    data:
      analysis.value?.costEntries.map(
        (entry) => `${entry.businessDate}\n#${entry.entrySeq}`,
      ) || [],
    axisLabel: { rotate: 25 },
  },
  yAxis: {
    type: "value",
    name: "成本变动 / 元",
    axisLabel: { formatter: formatChartTick },
  },
  series: [
    {
      type: "bar",
      data:
        analysis.value?.costEntries.map((entry) =>
          entry.costDelta == null ? null : Number(entry.costDelta),
        ) || [],
      itemStyle: { color: "#2563eb" },
    },
  ],
}));
function edit(row: PortfolioValuation) {
  replacement.value = row;
  valuationAt.value = row.valuationAt;
  valuationPrice.value = row.valuationPrice;
  remark.value = row.remark || "";
  reason.value = "";
}
async function saveValuation() {
  if (busy.value || uncertain.value || !detail.value) {
    return;
  }
  error.value = "";
  if (
    !valuationAt.value ||
    !priceInputValid(valuationPrice.value, replacement.value?.valuationPrice) ||
    !/[1-9]/.test(valuationPrice.value)
  ) {
    error.value = "请填写估值时点与有效正数价格（新填或改价最多三位小数）";
    return;
  }
  if (replacement.value && !reason.value.trim()) {
    error.value = "请填写估值更正原因";
    return;
  }
  busy.value = true;
  try {
    const latest = detail.value;
    const input = {
      positionId: latest.id,
      expectedVersion: latest.version,
      valuationAt: valuationAt.value,
      valuationPrice: valuationPrice.value,
      remark: remark.value || undefined,
    };
    if (replacement.value) {
      await valuations.replace({
        id: replacement.value.id,
        reason: reason.value,
        replacement: input,
      });
    } else {
      await valuations.create(input);
    }
    replacement.value = undefined;
    valuationAt.value = "";
    valuationPrice.value = "";
    await load();
    emit("changed");
  } catch (caughtError) {
    error.value = writeErrorText(caughtError);
    if (isUncertainWrite(caughtError)) {
      uncertain.value = true;
      checked.value = false;
    }
  } finally {
    busy.value = false;
  }
}
async function voidValuation(row: PortfolioValuation) {
  if (busy.value || !detail.value) {
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt(
      "原估值保留并作废，不再参与截止时点估值。",
      "作废估值",
      { inputValidator: (v) => !!v?.trim() || "请输入原因", type: "warning" },
    );
    busy.value = true;
    const latest = await positions.get(detail.value.id);
    await valuations.void({
      id: row.id,
      expectedVersion: latest.version,
      reason: value,
    });
    await load();
    emit("changed");
  } catch (caughtError) {
    if (caughtError !== "cancel" && caughtError !== "close") {
      error.value = errorText(caughtError);
    }
  } finally {
    busy.value = false;
  }
}
function trade(kind: typeof tradeKind.value) {
  tradeKind.value = kind;
  tradeOpen.value = true;
}
async function verifyValuations() {
  if (busy.value || !detail.value) {
    return;
  }
  busy.value = true;
  try {
    const records = await valuations.list({ positionId: detail.value.id });
    verificationRows.value = records.slice(0, 10).map((record) => ({
      id: record.id,
      at: record.valuationAt,
      label: "手工估值",
      amount: formatMoney(record.valuationPrice),
    }));
    detail.value = await positions.get(detail.value.id);
    checked.value = true;
  } catch (errorValue) {
    error.value = errorText(errorValue);
  } finally {
    busy.value = false;
  }
}
function resumeValuation() {
  if (!checked.value) {
    return;
  }
  uncertain.value = false;
  checked.value = false;
  error.value = "请确认人工估值尚未保存后再提交";
}
</script>
<template>
  <el-drawer
    v-model="opened"
    class="portfolio-drawer"
    title="持仓详情"
    size="860px"
  >
    <div v-loading="loading">
      <el-alert v-if="error" type="warning" :title="error" :closable="false" />
      <template v-if="detail">
        <header class="portfolio-header">
          <div>
            <h2>
              {{ detail.nameSnapshot }}
              <small>{{ detail.symbol }}</small>
            </h2>
            <PortfolioStatus :value="detail.costStatus" />
            <PortfolioStatus :value="detail.pnlStatus" />
          </div>
          <PortfolioTips
            title="核算口径"
            content="仅使用账本与手工估值。实时行情不参与盈亏。未录入的公司行动可能影响历史准确性，请手工补充。成本变动图按真实记账顺序展示，完整值见数据表。"
          />
        </header>
        <el-alert
          v-if="detail.message"
          :title="detail.message"
          type="info"
          :closable="false"
        />
        <el-descriptions :column="2" border>
          <el-descriptions-item label="截止时点">
            {{ detail.asOf || asOf || "当前" }}
          </el-descriptions-item>
          <el-descriptions-item label="数量">
            {{ detail.currentQuantity }}
          </el-descriptions-item>
          <el-descriptions-item label="剩余成本（元）">
            {{ formatMoney(detail.remainingCost) }}
          </el-descriptions-item>
          <el-descriptions-item label="单位成本（元）">
            {{ formatMoney(detail.averageCost) }}
          </el-descriptions-item>
          <el-descriptions-item label="交易已实现（元）">
            {{ formatMoney(detail.realizedPnl) }}
          </el-descriptions-item>
          <el-descriptions-item label="公司行动现金（元）">
            {{ formatMoney(detail.actionCashIncome) }}
          </el-descriptions-item>
          <el-descriptions-item label="手工估值价格（元）">
            {{ formatMoney(detail.valuationPrice) }}
          </el-descriptions-item>
          <el-descriptions-item label="估值时间">
            {{ detail.valuationAt || "未估值" }}
          </el-descriptions-item>
          <el-descriptions-item label="手工估值市值（元）">
            {{ formatMoney(detail.marketValue) }}
          </el-descriptions-item>
          <el-descriptions-item label="浮动盈亏（元）">
            {{ formatMoney(detail.unrealizedPnl) }}
          </el-descriptions-item>
          <el-descriptions-item label="综合收益（元）">
            {{ formatMoney(detail.totalPnl) }}
          </el-descriptions-item>
          <el-descriptions-item label="待处理行动">
            {{ detail.pendingActionCount }}
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="!asOf" class="portfolio-toolbar" style="margin-top: 16px">
          <el-button v-if="can('portfolio:trade:add')" @click="trade('BUY')">
            买入
          </el-button>
          <el-button
            v-if="can('portfolio:trade:add')"
            :disabled="detail.currentQuantity <= 0"
            @click="trade('SELL')"
          >
            卖出
          </el-button>
          <el-button
            v-if="can('portfolio:opening:add')"
            @click="trade('OPENING')"
          >
            期初
          </el-button>
        </div>
        <el-tabs>
          <el-tab-pane label="成本解释">
            <BaseChart
              v-if="analysis?.costEntries.length"
              :option="costOption"
              accessible-label="按记账顺序的成本变动"
              height="240px"
            />
            <el-empty v-else description="暂无成本记录" />
            <details>
              <summary>查看成本形成数据表</summary>
              <el-table :data="analysis?.costEntries">
                <el-table-column prop="businessDate" label="日期" width="110" />
                <el-table-column prop="type" label="类型" />
                <el-table-column prop="entrySeq" label="序号" />
                <el-table-column label="成本变化">
                  <template #default="{ row }">
                    {{ formatMoney(row.costDelta) }}
                  </template>
                </el-table-column>
                <el-table-column label="成本余额">
                  <template #default="{ row }">
                    {{ formatMoney(row.costBalance) }}
                  </template>
                </el-table-column>
                <el-table-column prop="quantityBalance" label="数量余额" />
              </el-table>
            </details>
          </el-tab-pane>
          <el-tab-pane v-if="can('portfolio:valuation:view')" label="手工估值">
            <template v-if="can('portfolio:valuation:update') && !asOf">
              <h3>{{ replacement ? "原子替代估值" : "新增手工估值" }}</h3>
              <el-form
                :disabled="busy || uncertain"
                label-position="top"
                class="portfolio-form"
              >
                <el-form-item label="估值时点（上海时间）">
                  <el-date-picker
                    v-model="valuationAt"
                    type="datetime"
                    value-format="YYYY-MM-DDTHH:mm:ss"
                  />
                </el-form-item>
                <el-form-item label="手工估值单价（元）">
                  <el-input
                    v-model="valuationPrice"
                    placeholder="新填或改价最多三位小数；历史未改值保留"
                  />
                </el-form-item>
                <el-form-item label="依据备注">
                  <el-input v-model="remark" />
                </el-form-item>
                <el-form-item v-if="replacement" label="更正原因">
                  <el-input v-model="reason" />
                </el-form-item>
              </el-form>
              <el-button
                type="primary"
                :loading="busy"
                :disabled="uncertain"
                @click="saveValuation"
              >
                {{ replacement ? "保存原子替代" : "保存估值" }}
              </el-button>
              <el-button
                v-if="replacement"
                :disabled="busy"
                @click="replacement = undefined"
              >
                取消更正
              </el-button>
            </template>
            <UncertainResultNotice
              v-if="uncertain"
              :checked="checked"
              :busy="busy"
              :rows="verificationRows"
              @check="verifyValuations"
              @resume="resumeValuation"
            />
            <el-table :data="valuationRows">
              <el-table-column
                prop="valuationAt"
                label="估值时点"
                min-width="180"
              />
              <el-table-column label="单价">
                <template #default="{ row }">
                  {{ formatMoney(row.valuationPrice) }}
                </template>
              </el-table-column>
              <el-table-column label="状态">
                <template #default="{ row }">
                  <PortfolioStatus :value="row.recordStatus" />
                </template>
              </el-table-column>
              <el-table-column
                v-if="can('portfolio:valuation:update') && !asOf"
                label="操作"
                width="150"
              >
                <template #default="{ row }">
                  <el-button
                    link
                    :disabled="row.recordStatus === 'VOID' || busy"
                    @click="edit(row as PortfolioValuation)"
                  >
                    更正
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    :disabled="row.recordStatus === 'VOID' || busy"
                    @click="voidValuation(row as PortfolioValuation)"
                  >
                    作废
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane v-if="can('portfolio:audit:view')" label="操作审计">
            <el-table :data="auditRows">
              <el-table-column prop="operation" label="操作" />
              <el-table-column prop="targetType" label="目标" />
              <el-table-column prop="operationReason" label="原因" />
              <el-table-column label="记录">
                <template #default="{ row }">
                  <el-popover trigger="click" width="480">
                    <template #reference>
                      <el-button link>查看前后数据</el-button>
                    </template>
                    <pre class="portfolio-json">{{
                      row.beforeData || "—"
                    }}</pre>
                    <pre class="portfolio-json">{{ row.afterData || "—" }}</pre>
                  </el-popover>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
    <TradeDrawer
      v-if="detail && tradeOpen"
      v-model="tradeOpen"
      :kind="tradeKind"
      :position="detail"
      @saved="
        load();
        emit('changed');
      "
    />
  </el-drawer>
</template>
