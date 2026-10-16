<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  getPortfolioDictionary,
  getPortfolioContext,
  previewTradeReplacement,
  trades,
} from "@/api/portfolio";
import BrokerReferenceDetails from "@/components/portfolio/BrokerReferenceDetails.vue";
import UncertainResultNotice from "@/components/portfolio/UncertainResultNotice.vue";
import type { EntityId } from "@/types/api";
import PortfolioStatus from "@/components/portfolio/PortfolioStatus.vue";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import type {
  PortfolioInstrument,
  PortfolioCommandContext,
  PortfolioTrade,
  TradeInput,
} from "@/types/portfolio";
import {
  decimalValid,
  priceInputValid,
  errorText,
  formatMoney,
  integerValid,
  isPortfolioConflict,
  isUncertainWrite,
  writeErrorText,
  localDate,
  usePortfolioCommand,
} from "@/utils/portfolio";
const props = defineProps<{
  modelValue: boolean;
  kind: "BUY" | "SELL" | "OPENING";
  position?: PortfolioCommandContext;
  original?: PortfolioTrade;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean]; saved: [] }>();
const opened = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const cmd = usePortfolioCommand();
const busy = ref(false);
const supplements = ref<HTMLDetailsElement>();
const error = ref("");
const uncertain = ref(false);
const checked = ref(false);
const verificationRows = ref<
  Array<{ id: EntityId; at: string; label: string; amount: string }>
>([]);
const matches = ref<PortfolioInstrument[]>([]);
const instrument = ref<PortfolioInstrument>();
const latestPosition = ref<PortfolioCommandContext>();
const form = reactive({
  assetType: "STOCK" as "STOCK" | "ETF",
  businessDate: localDate(),
  businessTime: "",
  quantity: "",
  price: "",
  grossAmount: "",
  openingCost: "",
  openingUnitCost: "",
  openingMode: "UNIT",
  openingCostVerified: false,
  feeDetails: "",
  feeBasis: "PENDING",
  estimatedFee: "",
  brokerEnabled: false,
  costBefore: "",
  costAfter: "",
  quantityAfter: "",
  actualFee: "",
  settlementAmount: "",
  amountDifferenceReason: "",
  confirmedNetPnl: "",
  confirmationScope: "CYCLE" as "CYCLE" | "TRADE",
  confirmationNote: "",
  reason: "",
  remark: "",
});
watch(
  form,
  () => {
    cmd.changed();
    error.value = "";
  },
  { deep: true, flush: "sync" },
);
watch(instrument, () => cmd.changed(), { flush: "sync" });
watch(
  () => latestPosition.value?.version,
  () => cmd.changed(),
);
watch(
  () => form.brokerEnabled,
  (enabled) => {
    if (!enabled && form.feeBasis === "INFERRED") {
      form.feeBasis = "PENDING";
    }
  },
);
watch(
  () => props.modelValue,
  async (value) => {
    if (!value) {
      return;
    }
    error.value = "";
    uncertain.value = false;
    checked.value = false;
    verificationRows.value = [];
    instrument.value = undefined;
    latestPosition.value = props.position;
    const originalTrade = props.original;
    Object.assign(form, {
      assetType: props.position?.assetType || "STOCK",
      businessDate: originalTrade?.businessDate || localDate(),
      businessTime: originalTrade?.businessTime || "",
      quantity: originalTrade ? String(originalTrade.quantity) : "",
      price: originalTrade?.price || "",
      grossAmount: originalTrade?.grossAmount || "",
      openingCost: originalTrade?.openingCost || "",
      openingUnitCost: originalTrade?.openingUnitCost || "",
      openingMode:
        originalTrade && originalTrade.openingUnitCost == null
          ? "TOTAL"
          : "UNIT",
      openingCostVerified: originalTrade?.openingCostVerified || false,
      feeDetails: originalTrade?.feeDetails || "",
      feeBasis:
        originalTrade?.settlementAmount != null
          ? "SETTLEMENT"
          : originalTrade?.actualFee != null
            ? "ACTUAL"
            : originalTrade?.feeSource === "BROKER_INFERRED_ESTIMATE"
              ? "INFERRED"
              : originalTrade?.estimatedFee != null
                ? "ESTIMATED"
                : "PENDING",
      actualFee: originalTrade?.actualFee || "",
      estimatedFee: originalTrade?.estimatedFee || "",
      brokerEnabled: !!originalTrade?.brokerReference,
      costBefore: originalTrade?.brokerReference?.costBefore || "",
      costAfter: originalTrade?.brokerReference?.costAfter || "",
      quantityAfter:
        originalTrade?.brokerReference?.quantityRemaining == null
          ? ""
          : String(originalTrade.brokerReference.quantityRemaining),
      settlementAmount: originalTrade?.settlementAmount || "",
      amountDifferenceReason: originalTrade?.amountDifferenceReason || "",
      confirmedNetPnl: originalTrade?.confirmedNetPnl || "",
      confirmationScope: originalTrade?.confirmationScope || "CYCLE",
      confirmationNote: originalTrade?.confirmationNote || "",
      reason: "",
      remark: originalTrade?.remark || "",
    });
    cmd.changed();
    if (props.position) {
      try {
        latestPosition.value = await getPortfolioContext(props.position.id);
      } catch (caughtError) {
        error.value = errorText(caughtError);
      }
    }
  },
  { immediate: true },
);
// 仅切换费用依据，金额与差额仍由后端重新预览，避免前端替代账务计算。
function adoptInferredFee() {
  cmd.changed();
  form.feeBasis = "INFERRED";
  if (supplements.value) {
    supplements.value.open = true;
  }
  error.value = "已选择券商反推预估，请重新预览后核对入账";
}
function adjustEstimatedFee() {
  const appliedFee = cmd.preview.value?.trade?.brokerReference?.feeApplied;
  cmd.changed();
  form.feeBasis = "ESTIMATED";
  form.estimatedFee = appliedFee ?? "";
  if (supplements.value) {
    supplements.value.open = true;
  }
  error.value = "请填写最终采用的预估费用及调整说明，再重新预览";
}
let searchSeq = 0;
async function search(query: string) {
  const seq = ++searchSeq;
  try {
    const result = await getPortfolioDictionary({
      keyword: query,
      assetType: form.assetType,
      pageNum: 1,
      pageSize: 30,
    });
    if (seq === searchSeq) {
      matches.value = result.list;
    }
  } catch (caughtError) {
    error.value = errorText(caughtError);
  }
}
function payload(): TradeInput {
  if (!integerValid(form.quantity) || Number(form.quantity) <= 0) {
    throw new Error("数量须为有效正整数");
  }
  if (!form.businessDate) {
    throw new Error("请选择业务日期");
  }
  if (!latestPosition.value && !instrument.value) {
    throw new Error("请选择字典标的");
  }
  if (
    !props.original &&
    props.kind === "SELL" &&
    (!latestPosition.value || latestPosition.value.currentQuantity <= 0)
  ) {
    throw new Error("无可卖持仓");
  }
  if (form.feeDetails) {
    try {
      const parsed = JSON.parse(form.feeDetails);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error();
      }
    } catch {
      throw new Error("费用明细须为有效JSON");
    }
  }
  if (props.original && !form.reason.trim()) {
    throw new Error("请填写更正原因");
  }
  const input: TradeInput = {
    tradeType: props.kind,
    businessDate: form.businessDate,
    businessTime: form.businessTime || undefined,
    quantity: Number(form.quantity),
    remark: form.remark || undefined,
  };
  if (latestPosition.value) {
    input.positionId = latestPosition.value.id;
    input.expectedVersion = latestPosition.value.version;
  } else {
    input.assetType = form.assetType;
    input.dictionaryId = instrument.value!.id;
  }
  if (props.kind === "OPENING") {
    if (form.openingMode === "UNIT") {
      if (
        form.openingUnitCost &&
        !priceInputValid(form.openingUnitCost)
      ) {
        throw new Error("期初每股 / 份成本须为非负数，最多三位小数");
      }
      input.openingUnitCost = form.openingUnitCost || undefined;
    } else {
      if (form.openingCost && !decimalValid(form.openingCost)) {
        throw new Error("期初总成本最多两位小数");
      }
      input.openingCost = form.openingCost || undefined;
    }
    input.openingCostVerified = form.openingCostVerified;
  } else {
    if (
      !priceInputValid(form.price, props.original?.price) ||
      !/[1-9]/.test(form.price)
    ) {
      throw new Error("成交单价须为正数，新填或改价最多三位小数");
    }
    if (
      form.grossAmount &&
      (!decimalValid(form.grossAmount) || !/[1-9]/.test(form.grossAmount))
    ) {
      throw new Error("成交金额须为正数，最多两位小数");
    }
    input.feeDetails = form.feeDetails || undefined;
    input.price = form.price;
    input.grossAmount = form.grossAmount || undefined;
    input.amountDifferenceReason = form.amountDifferenceReason || undefined;
    // 费用待补时不发送费用值，未知不自动按0入账。
    if (form.feeBasis === "ACTUAL") {
      if (!decimalValid(form.actualFee)) {
        throw new Error("请明确填写实际费用，允许为0");
      }
      input.actualFee = form.actualFee;
    }
    if (form.feeBasis === "ESTIMATED") {
      if (!decimalValid(form.estimatedFee)) {
        throw new Error("请明确填写人工预估费用，允许为0");
      }
      input.estimatedFee = form.estimatedFee;
    }
    // 券商观察独立于账本均价；操作前值只接受用户持有的真实记录。
    if (form.brokerEnabled) {
      if (
        form.costBefore &&
        !priceInputValid(
          form.costBefore,
          props.original?.brokerReference?.costBefore,
          true,
        )
      ) {
        throw new Error(
          "操作前券商持仓成本价格式错误（允许负数，新填或改价最多三位小数）",
        );
      }
      if (
        form.costAfter &&
        !priceInputValid(
          form.costAfter,
          props.original?.brokerReference?.costAfter,
          true,
        )
      ) {
        throw new Error(
          "操作后券商持仓成本价格式错误（新填或改价最多三位小数）",
        );
      }
      if (
        form.quantityAfter &&
        (!integerValid(form.quantityAfter) || Number(form.quantityAfter) < 0)
      ) {
        throw new Error("券商操作后数量须为非负安全整数");
      }
      if (!form.costBefore && !form.costAfter && !form.quantityAfter) {
        throw new Error("请填写至少一项券商实际观察值，不能借用账本均价");
      }
      if (
        form.feeBasis === "INFERRED" &&
        props.kind === "SELL" &&
        !form.costBefore
      ) {
        throw new Error(
          "采纳反推费用需真实操作前券商持仓成本价；只有操作后观察时可保持费用待补",
        );
      }
      input.brokerReference = {
        costBefore: form.costBefore || undefined,
        costAfter: form.costAfter || undefined,
        quantityAfter: form.quantityAfter
          ? Number(form.quantityAfter)
          : undefined,
        acceptInferredFee: form.feeBasis === "INFERRED",
      };
    } else if (form.feeBasis === "INFERRED") {
      throw new Error("反推费用须先填写券商对账输入");
    }
    if (form.feeBasis === "SETTLEMENT") {
      if (!decimalValid(form.settlementAmount)) {
        throw new Error("请明确填写实际结算金额");
      }
      input.settlementAmount = form.settlementAmount;
    }
    if (form.confirmedNetPnl) {
      if (!decimalValid(form.confirmedNetPnl, 2, true)) {
        throw new Error("确认盈亏最多两位小数");
      }
      input.confirmedNetPnl = form.confirmedNetPnl;
      input.confirmationScope = form.confirmationScope;
      input.confirmationNote = form.confirmationNote || undefined;
    }
  }
  return input;
}
async function preview() {
  if (busy.value || uncertain.value) {
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const input = payload();
    const result = props.original
      ? await previewTradeReplacement({
          id: props.original.id,
          reason: form.reason,
          replacement: input,
        })
      : await trades.preview(input);
    cmd.accept(result);
  } catch (caughtError) {
    error.value = errorText(caughtError);
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (busy.value || uncertain.value) {
    return;
  }
  try {
    const input = payload();
    if (!cmd.canSave()) {
      throw new Error("请先完成当前输入的有效预览");
    }
    busy.value = true;
    error.value = "";
    if (props.original) {
      await trades.replace({
        id: props.original.id,
        reason: form.reason,
        replacement: input,
      });
    } else {
      await trades.create(input);
    }
    ElMessage.success("已入账");
    emit("saved");
    opened.value = false;
  } catch (caughtError) {
    error.value = writeErrorText(caughtError);
    if (isPortfolioConflict(caughtError)) {
      cmd.preview.value = null;
    }
    if (isUncertainWrite(caughtError)) {
      uncertain.value = true;
      checked.value = false;
      cmd.changed();
    }
  } finally {
    busy.value = false;
  }
}

async function verifyRecords() {
  if (busy.value) {
    return;
  }
  busy.value = true;
  try {
    const records = await trades.list({
      positionId: latestPosition.value?.id,
      keyword: latestPosition.value ? undefined : instrument.value?.symbol,
    });
    verificationRows.value = records.slice(0, 10).map((record) => ({
      id: record.id,
      at: record.businessDate,
      label: `${record.nameSnapshot} · ${record.tradeType}`,
      amount: formatMoney(record.grossAmount ?? record.openingCost),
    }));
    if (latestPosition.value) {
      latestPosition.value = await getPortfolioContext(latestPosition.value.id);
    }
    checked.value = true;
  } catch (errorValue) {
    error.value = errorText(errorValue);
  } finally {
    busy.value = false;
  }
}
// 只有读取流水后再人工确认，才允许新的预览和提交；不自动重发。
function resumeEntry() {
  if (!checked.value) {
    return;
  }
  uncertain.value = false;
  checked.value = false;
  cmd.changed();
  error.value = "请重新预览人工输入，确认未入账后再提交";
}
</script>
<template>
  <el-drawer
    v-model="opened"
    class="portfolio-drawer"
    :title="`${original ? '更正' : '录入'}${kind === 'OPENING' ? '期初' : kind === 'BUY' ? '买入' : '卖出'}`"
    size="620px"
    :close-on-click-modal="!busy"
    :before-close="
      (done) => {
        if (!busy) done();
      }
    "
  >
    <el-alert
      v-if="error"
      class="portfolio-error"
      type="warning"
      :title="error"
      :closable="false"
    />
    <el-form
      :disabled="busy || uncertain"
      label-position="top"
      class="portfolio-form"
      @submit.prevent
    >
      <template v-if="!position">
        <el-form-item label="资产类型">
          <el-select
            v-model="form.assetType"
            @change="
              instrument = undefined;
              matches = [];
            "
          >
            <el-option label="股票" value="STOCK" />
            <el-option label="ETF" value="ETF" />
          </el-select>
        </el-form-item>
        <el-form-item label="字典标的">
          <el-select
            v-model="instrument"
            value-key="id"
            filterable
            remote
            :remote-method="search"
            placeholder="输入代码或名称查询"
          >
            <el-option
              v-for="item in matches"
              :key="String(item.id)"
              :label="`${item.name} ${item.symbol}`"
              :value="item"
            />
          </el-select>
        </el-form-item>
      </template>
      <el-form-item v-else class="wide" label="标的">
        <strong>{{ position.nameSnapshot }} · {{ position.symbol }}</strong>
      </el-form-item>
      <el-form-item label="业务日期">
        <el-date-picker
          v-model="form.businessDate"
          value-format="YYYY-MM-DD"
          type="date"
        />
      </el-form-item>
      <el-form-item label="实际时间（选填）">
        <el-input v-model="form.businessTime" placeholder="HH:mm:ss" />
      </el-form-item>
      <el-form-item label="数量（股 / 份）">
        <el-input
          v-model="form.quantity"
          inputmode="numeric"
          placeholder="正整数"
        />
      </el-form-item>
      <template v-if="kind === 'OPENING'">
        <el-form-item class="wide" label="期初成本录入方式">
          <el-radio-group v-model="form.openingMode">
            <el-radio-button value="UNIT">每股 / 份成本</el-radio-button>
            <el-radio-button value="TOTAL">总成本</el-radio-button>
          </el-radio-group>
          <PortfolioTips
            content="默认按每股 / 份成本录入，总成本由后端乘以数量计算。也可选择已有总成本；成本未知时留空，不填0。旧记录未保存单位成本时，沿用总额方式，避免重新解释原始事实。"
          />
        </el-form-item>
        <el-form-item
          v-if="form.openingMode === 'UNIT'"
          label="期初每股 / 份成本（元，未知留空）"
        >
          <el-input
            v-model="form.openingUnitCost"
            inputmode="decimal"
            placeholder="最多三位小数"
          />
        </el-form-item>
        <el-form-item v-else label="期初总成本（元，未知留空）">
          <el-input
            v-model="form.openingCost"
            inputmode="decimal"
            placeholder="最多两位小数"
          />
        </el-form-item>
        <el-form-item label="成本核验">
          <el-checkbox v-model="form.openingCostVerified">
            已人工核实期初成本
          </el-checkbox>
        </el-form-item>
      </template>
      <template v-else>
        <el-form-item label="成交单价（元）">
          <el-input
            v-model="form.price"
            inputmode="decimal"
            placeholder="实际成交单价，新填或改价最多三位小数"
          />
        </el-form-item>
        <el-form-item label="成交金额（后端计算，元）">
          <el-input
            :model-value="
              formatMoney(
                cmd.preview.value?.trade?.grossAmount ??
                  cmd.preview.value?.suggestedGrossAmount,
              )
            "
            disabled
            placeholder="预览后显示；有实际成交金额可在补录中覆盖"
          />
        </el-form-item>
        <template v-if="kind === 'SELL'">
          <el-alert
            v-if="original?.confirmedNetPnl != null && !form.confirmedNetPnl"
            class="wide"
            type="warning"
            title="本次更正将撤销原人工盈亏确认，请确认此项变更"
            :closable="false"
          />
          <el-form-item label="清仓确认口径">
            <el-select v-model="form.confirmationScope">
              <el-option label="本轮累计交易净盈亏" value="CYCLE" />
              <el-option label="仅本次交易净盈亏" value="TRADE" />
            </el-select>
          </el-form-item>
          <el-form-item
            :label="
              form.confirmationScope === 'CYCLE'
                ? '本轮累计交易净盈亏（清仓选填，元）'
                : '本次交易净盈亏（清仓选填，元）'
            "
          >
            <el-input v-model="form.confirmedNetPnl" inputmode="decimal" />
          </el-form-item>
          <el-form-item class="wide" label="确认依据">
            <el-input v-model="form.confirmationNote" maxlength="1000" />
            <PortfolioTips
              content="本轮累计交易净盈亏不含系统另记的分红或补扣税。若券商显示综合收益，须先核对口径，避免重复计入公司行动。前序交易盈亏未知时，仅确认本轮累计值，不把未知当0拆算最后一笔；本次交易值可能仍为空。"
            />
          </el-form-item>
        </template>
        <el-form-item class="wide" label="券商操作后观察（选填）">
          <el-checkbox v-model="form.brokerEnabled">
            记录券商持仓成本价及剩余数量，不替代账本核算
          </el-checkbox>
        </el-form-item>
        <template v-if="form.brokerEnabled">
          <el-form-item label="操作后券商持仓成本价（元）">
            <el-input
              v-model="form.costAfter"
              inputmode="decimal"
              placeholder="允许负数；仅有操作后信息也可录入"
            />
          </el-form-item>
          <el-form-item label="操作后券商剩余数量（股 / 份）">
            <el-input
              v-model="form.quantityAfter"
              inputmode="numeric"
              placeholder="有券商记录时填写"
            />
          </el-form-item>
          <el-form-item
            class="wide"
            label="操作前券商持仓成本价（有真实记录时选填，元）"
          >
            <el-input
              v-model="form.costBefore"
              inputmode="decimal"
              placeholder="不能借用账本平均成本，允许负数"
            />
            <PortfolioTips
              content="反推需成本口径一致、期间无其他变动，并考虑券商展示舍入误差。首次买入实际零仓时可由操作后成本反推；其余需真实操作前券商记录，不能借用账本均价。清仓不能依据操作后成本反推最后一笔费用。反推仅为费用合计预估，摊薄参考收益不累加入真实交易盈亏。"
            />
          </el-form-item>
        </template>
        <details ref="supplements" class="wide portfolio-advanced">
          <summary>费用与成交金额补录（选填）</summary>
          <div class="portfolio-form">
            <el-form-item label="费用依据">
              <el-select v-model="form.feeBasis">
                <el-option label="费用待补（不按0处理）" value="PENDING" />
                <el-option label="人工实际费用" value="ACTUAL" />
                <el-option label="实际结算金额" value="SETTLEMENT" />
                <el-option label="人工预估费用" value="ESTIMATED" />
                <el-option
                  v-if="form.brokerEnabled"
                  label="明确采纳反推费用（预估）"
                  value="INFERRED"
                />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="form.feeBasis === 'ACTUAL'"
              label="实际费用合计（元）"
            >
              <el-input
                v-model="form.actualFee"
                inputmode="decimal"
                placeholder="允许明确填0"
              />
            </el-form-item>
            <el-form-item
              v-if="form.feeBasis === 'ESTIMATED'"
              label="最终采用的预估费用（可修改，元）"
            >
              <el-input
                v-model="form.estimatedFee"
                inputmode="decimal"
                placeholder="人工填写，不预置金额"
              />
            </el-form-item>
            <el-form-item
              v-if="form.feeBasis === 'SETTLEMENT'"
              :label="kind === 'BUY' ? '实际扣款（元）' : '实际入账（元）'"
            >
              <el-input v-model="form.settlementAmount" inputmode="decimal" />
            </el-form-item>
            <el-form-item label="实际成交金额（有记录时覆盖，元）">
              <el-input
                v-model="form.grossAmount"
                inputmode="decimal"
                placeholder="留空采用后端按实际成交价量计算"
              />
            </el-form-item>
            <el-form-item
              class="wide"
              label="成交金额差异说明（覆盖存在差异时必填）"
            >
              <el-input v-model="form.amountDifferenceReason" maxlength="500" />
            </el-form-item>
            <el-form-item class="wide" label="费用解释明细（JSON，选填）">
              <el-input
                v-model="form.feeDetails"
                type="textarea"
                maxlength="4000"
              />
            </el-form-item>
            <PortfolioTips
              title="补录说明"
              content="事后可先按实际成交价量保存，费用未知为待补，不自动填0。实际费用、实际结算、人工预估或明确采纳反推只能选择一种，不叠加。补录与更正保留原记录和审计。"
            />
          </div>
        </details>
      </template>
      <el-form-item v-if="original" class="wide" label="更正原因">
        <el-input v-model="form.reason" maxlength="500" />
      </el-form-item>
      <el-form-item
        class="wide"
        :label="
          form.brokerEnabled && form.feeBasis === 'ESTIMATED'
            ? '预估费用调整说明 / 业务备注'
            : '备注'
        "
      >
        <el-input v-model="form.remark" maxlength="500" />
      </el-form-item>
    </el-form>
    <div v-if="cmd.preview.value" class="portfolio-preview">
      <p>
        {{
          cmd.preview.value.message ||
            (cmd.preview.value.canSave
              ? "预览通过，请核对后入账"
              : "当前不可入账")
        }}
      </p>
      <dl>
        <div>
          <dt>重放后当前数量</dt>
          <dd>{{ cmd.preview.value.after?.currentQuantity ?? "—" }}</dd>
        </div>
        <div v-if="kind === 'OPENING'">
          <dt>期初总成本（后端计算）</dt>
          <dd>{{ formatMoney(cmd.preview.value.trade?.openingCost) }}</dd>
        </div>
        <div>
          <dt>剩余成本</dt>
          <dd>{{ formatMoney(cmd.preview.value.after?.remainingCost) }}</dd>
        </div>
        <div>
          <dt>
            交易费用（未知不按0）
            <PortfolioStatus :value="cmd.preview.value.trade?.feeMode" />
          </dt>
          <dd>
            {{
              formatMoney(
                cmd.preview.value.trade?.actualFee ??
                  cmd.preview.value.trade?.estimatedFee,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>分摊成本</dt>
          <dd>{{ formatMoney(cmd.preview.value.trade?.allocatedCost) }}</dd>
        </div>
        <div>
          <dt>基础盈亏</dt>
          <dd>{{ formatMoney(cmd.preview.value.trade?.basePnl) }}</dd>
        </div>
        <div>
          <dt>独立校准额</dt>
          <dd>{{ formatMoney(cmd.preview.value.trade?.pnlAdjustment) }}</dd>
        </div>
        <div>
          <dt>本次交易盈亏（可能无法拆分）</dt>
          <dd>{{ formatMoney(cmd.preview.value.trade?.finalPnl) }}</dd>
        </div>
        <div
          v-if="
            cmd.preview.value.trade?.confirmationScope === 'CYCLE' &&
              cmd.preview.value.trade?.confirmedNetPnl != null
          "
        >
          <dt>本轮累计交易净盈亏（人工确认）</dt>
          <dd>{{ formatMoney(cmd.preview.value.trade.confirmedNetPnl) }}</dd>
        </div>
      </dl>
    </div>
    <BrokerReferenceDetails
      v-if="cmd.preview.value?.trade?.brokerReference"
      :reference="cmd.preview.value.trade.brokerReference"
    />
    <div
      v-if="cmd.preview.value?.trade?.brokerReference?.inferredFee != null"
      class="portfolio-actions"
    >
      <el-button
        :disabled="
          busy ||
            uncertain ||
            cmd.preview.value.trade.brokerReference.inferredFee.startsWith('-') ||
            !['BUY', 'PARTIAL'].includes(
              cmd.preview.value.trade.brokerReference.referenceType,
            )
        "
        @click="adoptInferredFee"
      >
        采纳反推值为预估费用
      </el-button>
      <el-button :disabled="busy || uncertain" @click="adjustEstimatedFee">
        手动调整预估费用
      </el-button>
    </div>
    <UncertainResultNotice
      v-if="uncertain"
      :checked="checked"
      :busy="busy"
      :rows="verificationRows"
      @check="verifyRecords"
      @resume="resumeEntry"
    />
    <template #footer>
      <el-button :disabled="busy" @click="opened = false">取消</el-button>
      <el-button :loading="busy" :disabled="uncertain" @click="preview">
        预览核算
      </el-button>
      <el-button
        type="primary"
        :disabled="uncertain || !cmd.preview.value?.canSave"
        :loading="busy"
        @click="save"
      >
        确认入账
      </el-button>
    </template>
  </el-drawer>
</template>
