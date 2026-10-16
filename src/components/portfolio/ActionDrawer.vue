<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  actions,
  getPortfolioContext,
  previewActionReplacement,
} from "@/api/portfolio";
import type {
  ActionInput,
  PortfolioAction,
  PortfolioCommandContext,
} from "@/types/portfolio";
import {
  decimalValid,
  errorText,
  formatMoney,
  integerValid,
  isPortfolioConflict,
  isUncertainWrite,
  writeErrorText,
  localDate,
  usePortfolioCommand,
} from "@/utils/portfolio";
import UncertainResultNotice from "@/components/portfolio/UncertainResultNotice.vue";
import type { EntityId } from "@/types/api";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
const props = defineProps<{
  modelValue: boolean;
  position: PortfolioCommandContext;
  original?: PortfolioAction;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean]; saved: [] }>();
const opened = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});
const cmd = usePortfolioCommand();
const busy = ref(false);
const error = ref("");
const uncertain = ref(false);
const checked = ref(false);
const verificationRows = ref<
  Array<{ id: EntityId; at: string; label: string; amount: string }>
>([]);
const latest = ref(props.position);
const form = reactive({
  actionType: "CASH_DIVIDEND",
  businessDate: localDate(),
  businessTime: "",
  cycleStartTradeId: "",
  quantityDelta: "",
  costDelta: "",
  cashIncome: "",
  taxAmount: "",
  reason: "",
  evidenceNote: "",
  pending: true,
  replaceReason: "",
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
watch(
  () => latest.value.version,
  () => cmd.changed(),
);
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      return;
    }
    uncertain.value = false;
    checked.value = false;
    verificationRows.value = [];
    const originalAction = props.original;
    Object.assign(form, {
      actionType: originalAction?.actionType || "CASH_DIVIDEND",
      businessDate: originalAction?.businessDate || localDate(),
      businessTime: originalAction?.businessTime || "",
      cycleStartTradeId:
        originalAction?.cycleStartTradeId == null
          ? ""
          : String(originalAction.cycleStartTradeId),
      quantityDelta:
        originalAction?.quantityDelta == null
          ? ""
          : String(originalAction.quantityDelta),
      costDelta: originalAction?.costDelta || "",
      cashIncome: originalAction?.cashIncome || "",
      taxAmount: originalAction?.taxAmount || "",
      reason: originalAction?.reason || "",
      evidenceNote: originalAction?.evidenceNote || "",
      remark: originalAction?.remark || "",
      pending: originalAction
        ? originalAction.recordStatus === "PENDING"
        : true,
      replaceReason: "",
    });
    cmd.changed();
    try {
      latest.value = await getPortfolioContext(props.position.id);
    } catch (caughtError) {
      error.value = errorText(caughtError);
    }
  },
  { immediate: true },
);
function payload(): ActionInput {
  if (!form.businessDate || !form.reason.trim()) {
    throw new Error("请填写生效日期与业务原因");
  }
  if (props.original && !form.replaceReason.trim()) {
    throw new Error("请填写替代原因");
  }
  if (
    form.actionType !== "TAX_WITHHOLDING" &&
    !form.pending &&
    (!integerValid(form.quantityDelta, true) ||
      !decimalValid(form.costDelta, 2, true) ||
      !decimalValid(form.cashIncome, 2, true))
  ) {
    throw new Error("生效时数量、成本、现金调整必须明确填写，无变化填0");
  }
  if (
    form.actionType !== "TAX_WITHHOLDING" &&
    form.pending &&
    ((form.quantityDelta && !integerValid(form.quantityDelta, true)) ||
      (form.costDelta && !decimalValid(form.costDelta, 2, true)) ||
      (form.cashIncome && !decimalValid(form.cashIncome, 2, true)))
  ) {
    throw new Error("调整数值格式错误");
  }
  // 正税额仅作输入；固定零数量/成本及负现金由后端生成，前端不重复扣减。
  if (form.actionType === "TAX_WITHHOLDING") {
    if (
      form.taxAmount &&
      (!decimalValid(form.taxAmount) || !/[1-9]/.test(form.taxAmount))
    ) {
      throw new Error("补扣税额须为正数，最多两位小数");
    }
    if (
      !form.pending &&
      (!form.taxAmount || !form.cycleStartTradeId || !form.evidenceNote.trim())
    ) {
      throw new Error("补扣税生效须填写正税额、所属周期及核对依据");
    }
  }
  return {
    positionId: props.position.id,
    expectedVersion: latest.value.version,
    actionType: form.actionType,
    businessDate: form.businessDate,
    businessTime: form.businessTime || undefined,
    cycleStartTradeId: form.cycleStartTradeId || undefined,
    quantityDelta:
      form.actionType === "TAX_WITHHOLDING"
        ? undefined
        : form.quantityDelta
          ? Number(form.quantityDelta)
          : undefined,
    costDelta:
      form.actionType === "TAX_WITHHOLDING"
        ? undefined
        : form.costDelta || undefined,
    cashIncome:
      form.actionType === "TAX_WITHHOLDING"
        ? undefined
        : form.cashIncome || undefined,
    taxAmount:
      form.actionType === "TAX_WITHHOLDING"
        ? form.taxAmount || undefined
        : undefined,
    reason: form.reason,
    evidenceNote: form.evidenceNote || undefined,
    pending: form.pending,
    remark: form.remark || undefined,
  };
}
async function preview() {
  if (busy.value || uncertain.value) {
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const p = payload();
    const result = props.original
      ? await previewActionReplacement({
          id: props.original.id,
          reason: form.replaceReason,
          replacement: p,
        })
      : await actions.preview(p);
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
    const p = payload();
    if (!cmd.canSave()) {
      throw new Error("请重新预览当前输入");
    }
    busy.value = true;
    if (props.original) {
      await actions.replace({
        id: props.original.id,
        reason: form.replaceReason,
        replacement: p,
      });
    } else {
      await actions.create(p);
    }
    ElMessage.success("公司行动已保存");
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
    const records = await actions.list({ positionId: props.position.id });
    verificationRows.value = records.slice(0, 10).map((record) => ({
      id: record.id,
      at: record.businessDate,
      label: record.actionType,
      amount: formatMoney(record.cashIncome),
    }));
    latest.value = await getPortfolioContext(props.position.id);
    checked.value = true;
  } catch (errorValue) {
    error.value = errorText(errorValue);
  } finally {
    busy.value = false;
  }
}
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
    :title="original ? '替代公司行动' : '记录公司行动'"
    size="600px"
    :close-on-click-modal="!busy"
    :before-close="
      (done) => {
        if (!busy) done();
      }
    "
  >
    <p>{{ position.nameSnapshot }} · {{ position.symbol }}</p>
    <PortfolioTips
      title="公司行动说明"
      content="不自动核算分红、送转、拆分、配股及ETF折算。待处理不参与核算；生效须人工确认数量、总成本和现金三项调整，无变化填0。现金收益独立于交易盈亏。"
    />
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <el-form
      :disabled="busy || uncertain"
      label-position="top"
      class="portfolio-form"
    >
      <el-form-item label="行动类型">
        <el-select v-model="form.actionType">
          <el-option
            v-for="[value, label] in [
              ['CASH_DIVIDEND', '现金分红'],
              ['BONUS_SHARES', '送转股'],
              ['SPLIT', '拆分'],
              ['RIGHTS', '配股'],
              ['ETF_CONVERSION', 'ETF份额折算'],
              ['TAX_WITHHOLDING', '手工补扣税'],
              ['OTHER', '其他'],
            ]"
            :key="value"
            :value="value"
            :label="label"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="处理状态">
        <el-switch
          v-model="form.pending"
          active-text="待处理"
          inactive-text="人工生效"
        />
      </el-form-item>
      <el-form-item label="生效日期">
        <el-date-picker v-model="form.businessDate" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-form-item label="实际时间（选填）">
        <el-input v-model="form.businessTime" placeholder="HH:mm:ss" />
      </el-form-item>
      <template v-if="form.actionType === 'TAX_WITHHOLDING'">
        <el-form-item class="wide" label="手工补扣税额（正数，元）">
          <el-input v-model="form.taxAmount" inputmode="decimal" />
          <PortfolioTips
            content="仅补录原到账金额尚未扣除的税，不得重复扣税。生效后数量和成本均不变，后端将税额记录为负现金收益；可关联已清仓周期。"
          />
        </el-form-item>
      </template>
      <template v-else>
        <el-form-item label="数量调整（股 / 份）">
          <el-input
            v-model="form.quantityDelta"
            placeholder="可正负，无变化填0"
          />
        </el-form-item>
        <el-form-item label="总成本调整（元）">
          <el-input v-model="form.costDelta" />
        </el-form-item>
        <el-form-item label="现金收益（元）">
          <el-input v-model="form.cashIncome" />
        </el-form-item>
      </template>
      <el-form-item
        :label="
          form.actionType === 'TAX_WITHHOLDING'
            ? '所属周期起始记录ID（生效必填）'
            : '历史周期起始记录ID（选填）'
        "
      >
        <el-input v-model="form.cycleStartTradeId" />
      </el-form-item>
      <el-form-item class="wide" label="业务原因">
        <el-input v-model="form.reason" maxlength="500" />
      </el-form-item>
      <el-form-item class="wide" label="核对依据">
        <el-input
          v-model="form.evidenceNote"
          type="textarea"
          maxlength="1000"
        />
      </el-form-item>
      <el-form-item class="wide" label="备注">
        <el-input v-model="form.remark" maxlength="500" />
      </el-form-item>
      <el-form-item v-if="original" class="wide" label="替代原因">
        <el-input v-model="form.replaceReason" maxlength="500" />
      </el-form-item>
    </el-form>
    <div v-if="cmd.preview.value" class="portfolio-preview">
      <p>{{ cmd.preview.value.message || "预览完成" }}</p>
      <p>
        重放后当前数量 {{ cmd.preview.value.after?.currentQuantity ?? "—" }} ·
        成本 {{ formatMoney(cmd.preview.value.after?.remainingCost) }} 元
      </p>
      <p>
        重放后独立现金收益
        {{ formatMoney(cmd.preview.value.after?.actionCashIncome) }} 元
      </p>
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
        预览
      </el-button>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="uncertain || !cmd.preview.value?.canSave"
        @click="save"
      >
        确认保存
      </el-button>
    </template>
  </el-drawer>
</template>
