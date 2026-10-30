<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { getPortfolioDictionary, positions, savePortfolioSnapshot } from "@/api/portfolio";
import PortfolioTips from "@/components/portfolio/PortfolioTips.vue";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { amountInputValid, amountInputValue, currentSnapshotTime, errorText, isPortfolioConflict, isUncertainWrite, operationNames, quantityInputValid, snapshotTimeValid } from "@/utils/portfolio";
import type { AssetType, PortfolioInstrument, PortfolioPosition, SnapshotInput, SnapshotOperation } from "@/types/portfolio";
const props = defineProps<{ modelValue: boolean; position?: PortfolioPosition; operation?: SnapshotOperation }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; saved: [string] }>();
const opened = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) });
const auth = useAuthStore();
const canUpdate = computed(() => canAccess(auth.permissionCodes, "portfolio:position:update"));
const current = ref<PortfolioPosition>();
const duplicate = ref<PortfolioPosition>();
const instruments = ref<PortfolioInstrument[]>([]);
const instrument = ref<PortfolioInstrument>();
const searching = ref(false);
const busy = ref(false);
const uncertain = ref(false);
const conflict = ref(false);
const error = ref("");
const form = reactive({ assetType: "STOCK" as AssetType, snapshotAt: "", operationType: "INITIAL" as SnapshotOperation, quantity: "", marketValue: "", totalCost: "", remark: "" });
let lookupEpoch = 0;
// 历史金额只无损去尾零，不把三位展示值或高精度原值自动舍入后保存。
function prefill(position?: PortfolioPosition) {
  current.value = position;
  form.quantity = position == null ? "" : String(position.currentQuantity);
  form.totalCost = amountInputValue(position?.totalCost);
  form.marketValue = amountInputValue(position?.marketValue);
  form.remark = position?.remark || "";
  form.operationType = props.operation || (position?.snapshotComplete ? "ADJUST" : "INITIAL");
}
watch(() => [props.modelValue, props.position, props.operation], () => {
  if (!props.modelValue) return;
  lookupEpoch++;
  searching.value = false;
  instruments.value = [];
  instrument.value = undefined;
  duplicate.value = undefined;
  uncertain.value = false;
  conflict.value = false;
  error.value = "";
  form.assetType = props.position?.assetType || "STOCK";
  form.snapshotAt = currentSnapshotTime();
  prefill(props.position);
}, { immediate: true });
function changeAsset() {
  lookupEpoch++;
  searching.value = false;
  instrument.value = undefined;
  instruments.value = [];
  duplicate.value = undefined;
}
async function searchInstruments(keyword: string) {
  if (!canUpdate.value || current.value) return;
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
async function checkExisting() {
  const own = ++lookupEpoch;
  duplicate.value = undefined;
  searching.value = false;
  if (!instrument.value) return;
  const chosen = instrument.value;
  searching.value = true;
  try {
    const existing = await positions.list({ assetType: chosen.assetType, keyword: chosen.symbol });
    if (own === lookupEpoch) duplicate.value = existing.find((position) => String(position.dictionaryId) === String(chosen.id) && position.assetType === chosen.assetType);
  } catch (caughtError) {
    if (own === lookupEpoch) {
      error.value = errorText(caughtError);
      instrument.value = undefined;
    }
  } finally {
    if (own === lookupEpoch) searching.value = false;
  }
}
async function useExisting() {
  if (!duplicate.value || busy.value) return;
  busy.value = true;
  try {
    prefill(await positions.get(duplicate.value.id));
    form.operationType = current.value?.snapshotComplete ? "ADJUST" : "INITIAL";
    duplicate.value = undefined;
    error.value = "";
  } catch (caughtError) { error.value = errorText(caughtError); }
  finally { busy.value = false; }
}
async function refreshVersion() {
  if (!current.value || busy.value) return;
  busy.value = true;
  try {
    current.value = await positions.get(current.value.id);
    conflict.value = false;
    error.value = "已刷新版本，请核对当前输入后再明确保存";
  } catch (caughtError) { error.value = errorText(caughtError); }
  finally { busy.value = false; }
}
async function save() {
  if (!canUpdate.value || busy.value || uncertain.value || conflict.value || searching.value || duplicate.value) return;
  error.value = "";
  if (!current.value && !instrument.value) { error.value = "请从字典选择标的"; return; }
  if (!snapshotTimeValid(form.snapshotAt)) { error.value = "请填写有效的上海时间，不能晚于当前时间"; return; }
  if (!quantityInputValid(form.quantity)) { error.value = "数量须为非负安全整数"; return; }
  if (form.remark.length > 500) { error.value = "备注最多500字"; return; }
  if (!amountInputValid(form.marketValue) || !amountInputValid(form.totalCost)) { error.value = "总市值和总成本必须明确填写非负金额，最多两位有效小数"; return; }
  const marketValue = amountInputValue(form.marketValue);
  const totalCost = amountInputValue(form.totalCost);
  if (Number(form.quantity) === 0 && (!/^0+$/.test(marketValue) || !/^0+$/.test(totalCost))) { error.value = "清仓数量为0时，总市值和总成本都必须明确填写0"; return; }
  // 完整人工状态一次提交；买卖类型只作说明，不能据此推算成本或费用。
  const input: SnapshotInput = { snapshotAt: form.snapshotAt, operationType: form.operationType, quantity: Number(form.quantity), marketValue, totalCost, remark: form.remark || undefined };
  if (current.value) {
    input.positionId = current.value.id;
    input.expectedVersion = current.value.version;
  } else {
    input.assetType = form.assetType;
    input.dictionaryId = instrument.value!.id;
  }
  busy.value = true;
  try {
    const id = await savePortfolioSnapshot(input);
    emit("saved", id);
    opened.value = false;
    ElMessage.success("持仓快照已保存");
  } catch (caughtError) {
    conflict.value = isPortfolioConflict(caughtError);
    uncertain.value = isUncertainWrite(caughtError);
    error.value = uncertain.value ? `${errorText(caughtError)}；结果未确认，请关闭表单并查询快照历史，核对后再决定是否重新录入，不要重复提交` : conflict.value ? `${errorText(caughtError)}；请先刷新持仓版本并核对输入` : errorText(caughtError);
  } finally { busy.value = false; }
}
</script>
<template>
  <el-drawer v-model="opened" class="portfolio-drawer" :title="current ? operationNames[form.operationType] : '新增持仓快照'" size="620px">
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <el-alert v-if="duplicate" title="该标的已有持仓，请维护已有持仓，避免重复建立身份" type="info" :closable="false">
      <el-button :disabled="busy" @click="useExisting">维护已有持仓</el-button>
    </el-alert>
    <PortfolioTips title="人工快照说明" content="请录入操作完成后的完整数量、总市值、总成本，买入/卖出/调整只是本次记录说明，不自动推算金额。价格、平均成本及浮动盈亏由后端计算；较早补录只进入历史。录错后新增调整记录，历史不覆盖。清仓必须明确填写三个0。" />
    <el-form class="portfolio-form" label-position="top" :disabled="busy || uncertain || conflict || !canUpdate">
      <template v-if="!current">
        <el-form-item label="资产类型">
          <el-select v-model="form.assetType" @change="changeAsset"><el-option label="股票" value="STOCK" /><el-option label="ETF" value="ETF" /></el-select>
        </el-form-item>
        <el-form-item label="字典标的">
          <el-select v-model="instrument" value-key="id" filterable remote clearable :loading="searching" :remote-method="searchInstruments" placeholder="输入代码或名称搜索" @change="checkExisting">
            <el-option v-for="item in instruments" :key="String(item.id)" :value="item" :label="`${item.name} ${item.symbol}`" />
          </el-select>
        </el-form-item>
      </template>
      <div v-else class="wide portfolio-inline"><strong>{{ current.nameSnapshot }}</strong><span>{{ current.symbol }}</span></div>
      <el-alert v-if="current && !current.snapshotComplete" class="wide" title="待首次完整录入：原数量和成本仅作预填参考，补齐本次总市值与时点后才形成真实快照" type="info" :closable="false" />
      <el-form-item label="记录类型"><el-select v-model="form.operationType"><el-option v-for="(label, value) in operationNames" :key="value" :label="label" :value="value" /></el-select></el-form-item>
      <el-form-item label="快照时点（上海时间）"><el-date-picker v-model="form.snapshotAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
      <el-form-item label="持仓数量（股 / 份）"><el-input v-model="form.quantity" inputmode="numeric" /></el-form-item>
      <el-form-item label="总市值（元）"><el-input v-model="form.marketValue" inputmode="decimal" placeholder="最多两位有效小数，未知不能保存" /></el-form-item>
      <el-form-item label="总成本（元）"><el-input v-model="form.totalCost" inputmode="decimal" placeholder="最多两位有效小数，未知不能保存" /></el-form-item>
      <el-form-item class="wide" label="备注"><el-input v-model="form.remark" type="textarea" maxlength="500" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="conflict" :loading="busy" @click="refreshVersion">刷新当前版本</el-button>
      <el-button :disabled="busy" @click="opened = false">{{ uncertain ? '关闭并核对快照历史' : '取消' }}</el-button>
      <el-button v-if="canUpdate" type="primary" :loading="busy" :disabled="uncertain || conflict || searching || !!duplicate" @click="save">保存持仓快照</el-button>
    </template>
  </el-drawer>
</template>
