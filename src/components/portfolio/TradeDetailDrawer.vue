<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { trades } from "@/api/portfolio";
import BrokerReferenceDetails from "@/components/portfolio/BrokerReferenceDetails.vue";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import type { EntityId } from "@/types/api";
import type { PortfolioTrade } from "@/types/portfolio";
import { errorText, feeSourceNames, formatMoney } from "@/utils/portfolio";
const props = defineProps<{ modelValue: boolean; id?: EntityId }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();
const opened = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});
const row = ref<PortfolioTrade>();
const error = ref("");
const busy = ref(false);
let seq = 0;
watch(
  () => [props.modelValue, props.id],
  async () => {
    if (!props.modelValue || props.id == null) {
      return;
    }
    const own = ++seq;
    row.value = undefined;
    error.value = "";
    busy.value = true;
    try {
      const result = await trades.get(props.id);
      if (own === seq) {
        row.value = result;
      }
    } catch (caughtError) {
      if (own === seq) {
        error.value = errorText(caughtError);
      }
    } finally {
      if (own === seq) {
        busy.value = false;
      }
    }
  },
  { immediate: true },
);
const moneyFields = [
  ["price", "成交单价"],
  ["grossAmount", "成交金额"],
  ["openingCost", "期初总成本"],
  ["openingUnitCost", "期初每股 / 份成本"],
  ["actualFee", "实际费用"],
  ["estimatedFee", "预估费用"],
  ["settlementAmount", "实际结算"],
  ["allocatedCost", "分摊成本"],
  ["basePnl", "基础盈亏"],
  ["pnlAdjustment", "独立校准额"],
  ["finalPnl", "本笔交易盈亏"],
  ["confirmedNetPnl", "人工确认净盈亏原值"],
] as const;
</script>
<template>
  <el-drawer
    v-model="opened"
    class="portfolio-drawer"
    title="交易详情"
    size="680px"
  >
    <div v-loading="busy">
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template v-if="row">
        <h2>
          {{ row.nameSnapshot }} ·
          <PortfolioStatus :value="row.tradeType" />
        </h2>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="业务日期">
            {{ row.businessDate }}
          </el-descriptions-item>
          <el-descriptions-item label="实际时间">
            {{ row.businessTime || "未填写" }}
          </el-descriptions-item>
          <el-descriptions-item label="数量">
            {{ row.quantity }}
          </el-descriptions-item>
          <el-descriptions-item label="记录状态">
            <PortfolioStatus :value="row.recordStatus" />
          </el-descriptions-item>
          <el-descriptions-item
            v-for="[field, label] in moneyFields"
            :key="field"
            :label="`${label}（元）`"
          >
            {{ formatMoney(row[field]) }}
          </el-descriptions-item>
          <el-descriptions-item label="费用口径">
            <PortfolioStatus :value="row.feeMode" />
          </el-descriptions-item>
          <el-descriptions-item label="费用来源">
            {{ feeSourceNames[row.feeSource || ""] || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="核算状态">
            <PortfolioStatus :value="row.calculationStatus" />
          </el-descriptions-item>
          <el-descriptions-item label="确认状态">
            <PortfolioStatus :value="row.confirmationStatus" />
          </el-descriptions-item>
          <el-descriptions-item label="确认范围">
            {{
              row.confirmationScope === "CYCLE"
                ? "本轮持仓周期"
                : row.confirmationScope === "TRADE"
                  ? "本次交易"
                  : "—"
            }}
          </el-descriptions-item>
          <el-descriptions-item label="金额差异原因">
            {{ row.amountDifferenceReason || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="确认依据">
            {{ row.confirmationNote || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="作废原因">
            {{ row.voidReason || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="替代原记录">
            {{ row.replacesTradeId || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="当前周期首笔">
            {{ row.cycleStartTradeId || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="确认时周期首笔">
            {{ row.confirmedCycleStartTradeId || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="备注">
            {{ row.remark || "—" }}
          </el-descriptions-item>
        </el-descriptions>
        <BrokerReferenceDetails
          v-if="row.brokerReference"
          :reference="row.brokerReference"
        />
        <p
          v-if="
            row.confirmationScope === 'CYCLE' && row.confirmedNetPnl != null
          "
        >
          本轮累计交易净盈亏（人工确认）：{{ formatMoney(row.confirmedNetPnl) }}
          元；不再重复加上本轮此前盈亏。最后一笔无法拆分时保持为空。
        </p>
        <h3>费用解释明细</h3>
        <pre class="portfolio-json">{{ row.feeDetails || "—" }}</pre>
      </template>
    </div>
  </el-drawer>
</template>
