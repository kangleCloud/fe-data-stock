<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { getPortfolioDictionary, getPortfolioPositionDetail, savePortfolioDaily } from "@/api/portfolio";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { amountInputValid, amountInputValue, currentTradeDate, errorText, quantityInputValid, signedAmountInputValid, subtractDecimal, tradeDateValid } from "@/utils/portfolio";
import type { AssetType, PortfolioDaily, PortfolioDailyInput, PortfolioInstrument, PortfolioPosition } from "@/types/portfolio";

type EntryMode = "marketValue" | "pnl";

const props = defineProps<{ modelValue: boolean; position?: PortfolioPosition }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; saved: [string] }>();
const opened = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) });
const auth = useAuthStore();
const canUpdate = computed(() => canAccess(auth.permissionCodes, "portfolio:position:update"));

const instruments = ref<PortfolioInstrument[]>([]);
const instrument = ref<PortfolioInstrument>();
const records = ref<PortfolioDaily[]>([]);
const searching = ref(false);
const loadingDetail = ref(false);
const busy = ref(false);
const error = ref("");
const form = reactive({
  assetType: "STOCK" as AssetType,
  entryMode: "marketValue" as EntryMode,
  tradeDate: "",
  quantity: "",
  marketValue: "",
  pnl: "",
  totalCost: "",
  remark: "",
});
let lookupEpoch = 0;
let detailEpoch = 0;

const existingRecord = computed(() =>
  props.position ? records.value.find((record) => record.tradeDate === form.tradeDate) : undefined,
);
const zeroQuantity = computed(() => form.quantity !== "" && Number(form.quantity) === 0);
const computedTotalCost = computed(() =>
  form.entryMode === "pnl" ? subtractDecimal(form.marketValue, form.pnl) ?? "" : "",
);

function prefillPosition(position: PortfolioPosition) {
  form.quantity = String(position.quantity);
  form.totalCost = amountInputValue(position.totalCost);
  form.marketValue = amountInputValue(position.marketValue);
  form.pnl = amountInputValue(subtractDecimal(form.marketValue, form.totalCost) ?? "");
  form.remark = position.remark || "";
}

function prefillRecord(record: PortfolioDaily) {
  form.quantity = String(record.quantity);
  form.totalCost = amountInputValue(record.totalCost);
  form.marketValue = amountInputValue(record.marketValue);
  form.pnl = amountInputValue(subtractDecimal(form.marketValue, form.totalCost) ?? "");
  form.remark = record.remark || "";
}

function clearValues() {
  form.quantity = "";
  form.marketValue = "";
  form.pnl = "";
  form.totalCost = "";
  form.remark = "";
}

function applyRecordForDate() {
  if (!props.position) return;
  const record = records.value.find((item) => item.tradeDate === form.tradeDate);
  if (record) prefillRecord(record);
  else prefillPosition(props.position);
}

function reset() {
  lookupEpoch++;
  detailEpoch++;
  searching.value = false;
  loadingDetail.value = false;
  busy.value = false;
  error.value = "";
  instruments.value = [];
  instrument.value = undefined;
  records.value = [];
  form.assetType = props.position?.assetType || "STOCK";
  form.entryMode = "marketValue";
  form.tradeDate = currentTradeDate();
  form.pnl = "";
  if (props.position) prefillPosition(props.position);
  else clearValues();
}

function changeEntryMode(mode: string | number | boolean | undefined) {
  if (mode === "pnl") {
    form.pnl = amountInputValue(subtractDecimal(form.marketValue, form.totalCost) ?? "");
  } else if (mode === "marketValue") {
    form.totalCost = amountInputValue(subtractDecimal(form.marketValue, form.pnl) ?? "");
  }
}

function changeAsset() {
  lookupEpoch++;
  instruments.value = [];
  instrument.value = undefined;
}

async function searchInstruments(keyword: string) {
  if (!canUpdate.value || props.position) return;
  const own = ++lookupEpoch;
  searching.value = true;
  try {
    const result = await getPortfolioDictionary({ assetType: form.assetType, keyword, pageNum: 1, pageSize: 30 });
    if (own === lookupEpoch) instruments.value = result.list;
  } catch (caughtError) {
    if (own === lookupEpoch) error.value = errorText(caughtError);
  } finally {
    if (own === lookupEpoch) searching.value = false;
  }
}

async function loadRecords() {
  if (!props.position) return;
  const own = ++detailEpoch;
  loadingDetail.value = true;
  try {
    const detail = await getPortfolioPositionDetail(props.position.id);
    if (own !== detailEpoch) return;
    records.value = detail.records;
    applyRecordForDate();
  } catch (caughtError) {
    if (own === detailEpoch) error.value = errorText(caughtError);
  } finally {
    if (own === detailEpoch) loadingDetail.value = false;
  }
}

watch(
  () => [props.modelValue, props.position],
  () => {
    if (!props.modelValue) {
      detailEpoch++;
      lookupEpoch++;
      return;
    }
    reset();
    void loadRecords();
  },
  { immediate: true },
);

async function save() {
  if (!canUpdate.value || busy.value || searching.value || loadingDetail.value) return;
  error.value = "";
  if (!props.position && !instrument.value) {
    error.value = "请选择标的";
    return;
  }
  if (!tradeDateValid(form.tradeDate)) {
    error.value = "请选择不晚于今天的记录日期";
    return;
  }
  if (!quantityInputValid(form.quantity)) {
    error.value = "数量须为非负安全整数";
    return;
  }
  let marketValue: string;
  let totalCost: string;
  if (form.entryMode === "marketValue") {
    if (!amountInputValid(form.marketValue)) {
      error.value = "总市值必须为非负金额，最多两位有效小数";
      return;
    }
    if (!amountInputValid(form.totalCost)) {
      error.value = "总成本必须为非负金额，最多两位有效小数";
      return;
    }
    marketValue = amountInputValue(form.marketValue);
    totalCost = amountInputValue(form.totalCost);
  } else {
    if (!amountInputValid(form.marketValue)) {
      error.value = "总市值必须为非负金额，最多两位有效小数";
      return;
    }
    if (!signedAmountInputValid(form.pnl)) {
      error.value = "浮动盈亏必须为金额，最多两位有效小数";
      return;
    }
    const computed = subtractDecimal(form.marketValue, form.pnl);
    if (computed == null) {
      error.value = "总成本计算失败，请检查金额";
      return;
    }
    if (computed.startsWith("-")) {
      error.value = "浮动盈亏不能超过总市值，总成本不能为负";
      return;
    }
    if (!amountInputValid(computed)) {
      error.value = "总成本超出金额范围";
      return;
    }
    marketValue = amountInputValue(form.marketValue);
    totalCost = amountInputValue(computed);
  }
  if (form.remark.length > 500) {
    error.value = "备注最多500字";
    return;
  }
  const input: PortfolioDailyInput = {
    tradeDate: form.tradeDate,
    quantity: Number(form.quantity),
    marketValue,
    totalCost,
    remark: form.remark || undefined,
  };
  if (props.position) {
    input.positionId = props.position.id;
  } else {
    input.assetType = form.assetType;
    input.dictionaryId = instrument.value!.id;
  }
  busy.value = true;
  try {
    const id = await savePortfolioDaily(input);
    emit("saved", id);
    opened.value = false;
    ElMessage.success("收盘记录已保存");
  } catch (caughtError) {
    error.value = errorText(caughtError);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <el-drawer v-model="opened" class="portfolio-drawer" :title="position ? '记录持仓' : '新增标的并记录'" size="560px">
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <el-alert v-if="existingRecord" title="该日期已有记录，保存将覆盖当日数据" type="info" :closable="false" />
    <el-alert v-if="zeroQuantity" title="数量为0时按清仓记录，市值和总成本按0保存" type="info" :closable="false" />
    <PortfolioTips
      title="收盘记录"
      content="记录收盘后的数量、总市值，以及总成本或浮动盈亏；按盈亏录入时自动计算总成本。同一日期重复保存会覆盖当日记录。平均成本、参考价和浮动盈亏由系统计算，不读取实时行情。"
    />
    <div v-loading="loadingDetail">
      <el-form class="portfolio-form" label-position="top" :disabled="busy || loadingDetail || !canUpdate">
        <template v-if="!position">
          <el-form-item label="资产类型">
            <el-select v-model="form.assetType" @change="changeAsset">
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
              clearable
              :loading="searching"
              :remote-method="searchInstruments"
              placeholder="输入代码或名称搜索"
            >
              <el-option
                v-for="item in instruments"
                :key="String(item.id)"
                :value="item"
                :label="`${item.name} ${item.symbol}`"
              />
            </el-select>
          </el-form-item>
        </template>
        <div v-else class="wide portfolio-inline">
          <strong>{{ position.nameSnapshot }}</strong><span>{{ position.symbol }}</span>
        </div>
        <el-form-item label="记录日期">
          <el-date-picker
            v-model="form.tradeDate"
            type="date"
            value-format="YYYY-MM-DD"
            @change="applyRecordForDate"
          />
        </el-form-item>
        <el-form-item label="持仓数量（股 / 份）">
          <el-input v-model="form.quantity" inputmode="numeric" />
        </el-form-item>
        <el-form-item class="wide" label="金额录入方式">
          <el-radio-group v-model="form.entryMode" @change="changeEntryMode">
            <el-radio-button value="marketValue">按总市值</el-radio-button>
            <el-radio-button value="pnl">按浮动盈亏</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="form.entryMode === 'marketValue'">
          <el-form-item label="总市值（元）">
            <el-input v-model="form.marketValue" inputmode="decimal" placeholder="最多两位有效小数" />
          </el-form-item>
          <el-form-item label="总成本（元）">
            <el-input v-model="form.totalCost" inputmode="decimal" placeholder="最多两位有效小数" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="总市值（元）">
            <el-input v-model="form.marketValue" inputmode="decimal" placeholder="最多两位有效小数" />
          </el-form-item>
          <el-form-item label="浮动盈亏（元）">
            <el-input v-model="form.pnl" inputmode="decimal" placeholder="亏损填负数，如 -2368.61" />
          </el-form-item>
          <el-form-item class="wide" label="总成本（自动计算）">
            <el-input :model-value="computedTotalCost" disabled placeholder="填写总市值和浮动盈亏后自动计算" />
          </el-form-item>
          <div class="wide portfolio-muted">总成本 = 总市值 − 浮动盈亏（亏损为负数）</div>
        </template>
        <el-form-item class="wide" label="备注">
          <el-input v-model="form.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button :disabled="busy" @click="opened = false">取消</el-button>
      <el-button v-if="canUpdate" type="primary" :loading="busy" :disabled="searching || loadingDetail" @click="save">
        保存记录
      </el-button>
    </template>
  </el-drawer>
</template>
