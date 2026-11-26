<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { enableRiskMapServer, getRiskMapServers, saveRiskMapServer } from "@/api/riskMonitor";
import { useRiskConfigPolling } from "@/composables/useRiskConfigPolling";
import { ApiError } from "@/utils/request";
import { createRiskPolling } from "@/utils/riskPolling";
import { riskCoordinate } from "@/utils/riskServer";
import type { RiskMapServer, RiskMapServerInput } from "@/types/riskMonitor";

const props = defineProps<{ readable: boolean; writable: boolean }>();
const items = ref<RiskMapServer[]>([]);
const writing = ref(false);
const loading = ref(false);
const busy = computed(() => writing.value || loading.value);
const editing = ref(false);
const confirming = ref(false);
const error = ref("");
const loadError = ref("");
const message = ref("");
const empty = (): Omit<RiskMapServerInput, "version"> => ({ id: null, name: "", publicIp: "", longitude: null, latitude: null, coordinateSystem: null, locationSource: "AMAP", enabled: true });
const form = reactive(empty());
let generation = 0;
let disposed = false;
let refreshOnReturn = false;
const current = (token: number) => !disposed && token === generation && props.readable;
const visible = useRiskConfigPolling(() => {
  if (refreshOnReturn) {
    load();
    return;
  }
  if (!busy.value && !editing.value && !confirming.value) listPoll.poll();
}, pause);
const canRead = () => visible() && props.readable;
const listPoll = createRiskPolling({
  auto: false,
  visible: canRead,
  load: getRiskMapServers,
  accept: result => {
    items.value = result;
    loadError.value = "";
    loading.value = false;
  },
  reject: () => {
    loadError.value = "地图代理服务器读取失败，保留上次成功结果。";
    loading.value = false;
  },
});
function pause() {
  listPoll.discard();
  loading.value = false;
}
function load() {
  if (!props.readable) return;
  refreshOnReturn = !visible();
  if (refreshOnReturn) return;
  error.value = "";
  loading.value = true;
  listPoll.invalidate();
}
function edit(target?: RiskMapServer) {
  if (!props.writable) return;
  listPoll.discard();
  Object.assign(form, target ? {
    id: target.id,
    name: target.name,
    publicIp: target.publicIp,
    longitude: target.longitude,
    latitude: target.latitude,
    coordinateSystem: target.coordinateSystem,
    locationSource: target.locationSource,
    enabled: target.enabled,
  } : empty());
  editing.value = true; error.value = ""; message.value = "";
}
async function save() {
  if (!canRead() || !props.writable || busy.value) return;
  if (!form.name.trim() || !form.publicIp.trim()) { error.value = "请填写名称和公网 IP。"; return; }
  if (form.locationSource === "MANUAL" && (!form.coordinateSystem || riskCoordinate(form.longitude ?? "", 180) === undefined || riskCoordinate(form.latitude ?? "", 90) === undefined)) { error.value = "请填写有效的坐标和坐标系。"; return; }
  const input: RiskMapServerInput = { id: form.id, version: null, name: form.name.trim(), publicIp: form.publicIp.trim(), longitude: form.locationSource === "MANUAL" ? form.longitude : null, latitude: form.locationSource === "MANUAL" ? form.latitude : null, coordinateSystem: form.locationSource === "MANUAL" ? form.coordinateSystem : null, locationSource: form.locationSource, enabled: form.enabled };
  const token = ++generation;
  listPoll.discard();
  writing.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await saveRiskMapServer(input);
    if (!current(token) || !props.writable) return;
    editing.value = false;
    message.value = result.locationStatus === "UNRESOLVED" ? "已保存，定位失败或未配置高德；可编辑并手工录入坐标。" : "地图代理服务器已保存。";
    load();
  } catch (reason) {
    if (current(token)) {
      const code = reason instanceof ApiError ? reason.code : undefined;
      if (code === 404) error.value = "该地图代理服务器已不存在，请刷新列表核对。编辑内容已保留。";
      else if (code === 423) error.value = "该公网 IP 已被其他地图代理服务器使用，请修改后重试。";
      else error.value = "保存失败，请核对配置后重试。";
    }
  } finally { if (current(token)) writing.value = false; }
}
async function toggle(target: RiskMapServer) {
  if (!props.writable || busy.value || confirming.value) return;
  confirming.value = true;
  try { await ElMessageBox.confirm(`${target.enabled ? "停用" : "启用"}地图代理服务器 ${target.name}？`, "修改地图服务器配置", { confirmButtonText: target.enabled ? "停用" : "启用", cancelButtonText: "取消", type: target.enabled ? "warning" : "info" }); }
  catch { return; }
  finally { confirming.value = false; }
  if (!canRead() || !props.writable || busy.value) return;
  const token = ++generation;
  listPoll.discard();
  writing.value = true;
  error.value = "";
  message.value = "";
  try {
    await enableRiskMapServer({ id: target.id, version: null, enabled: !target.enabled });
    if (!current(token) || !props.writable) return;
    load();
  } catch (reason) {
    if (current(token)) {
      error.value = reason instanceof ApiError && reason.code === 404
        ? "该地图代理服务器已不存在，请刷新列表核对。"
        : "状态更新失败，请刷新后重试。";
    }
  } finally { if (current(token)) writing.value = false; }
}
watch(() => [props.readable, props.writable], () => {
  generation++;
  refreshOnReturn = false;
  pause();
  writing.value = false;
  items.value = [];
  editing.value = false;
  error.value = "";
  loadError.value = "";
  message.value = "";
  Object.assign(form, empty());
  load();
}, { immediate: true });
onBeforeUnmount(() => {
  disposed = true;
  listPoll.stop();
});
</script>

<template>
  <section class="page-panel risk-admin-panel" aria-labelledby="map-servers-title">
    <div class="risk-admin-toolbar"><h2 id="map-servers-title">地图代理服务器</h2><div class="risk-admin-actions"><button class="risk-admin-button" :disabled="busy" @click="load">刷新地图服务器</button> <button v-if="writable" class="risk-admin-button is-primary" :disabled="busy" @click="edit()">新增地图服务器</button></div></div>
    <p v-if="error || loadError" class="risk-admin-alert is-error" role="alert">{{ error || loadError }}</p><p v-if="message" class="risk-admin-alert is-success" role="status">{{ message }}</p>
    <div class="risk-admin-table-wrap"><table class="risk-admin-table"><thead><tr><th>名称</th><th>公网 IP</th><th>位置</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td><strong>{{ item.name }}</strong></td><td>{{ item.publicIp }}</td><td>{{ item.locationStatus === 'LOCATED' ? `${item.longitude}, ${item.latitude}（${item.coordinateSystem}）` : '未定位' }}</td><td><span class="risk-admin-tag" :class="{ 'is-enabled': item.enabled }">{{ item.enabled ? '已启用' : '已停用' }}</span></td><td><div class="risk-admin-row-actions"><button v-if="writable" class="risk-admin-link" :disabled="busy" @click="edit(item)">编辑</button> <button v-if="writable" class="risk-admin-link" :disabled="busy" @click="toggle(item)">{{ item.enabled ? '停用' : '启用' }}</button></div></td></tr></tbody></table></div>
    <p v-if="!items.length && !busy && !error && !loadError" class="risk-admin-empty">暂无地图代理服务器</p>
    <form v-if="editing && writable" class="config-form" @submit.prevent="save">
      <h3>{{ form.id ? '编辑地图服务器' : '新增地图服务器' }}</h3>
      <div class="risk-admin-form-grid">
        <label>名称<input v-model="form.name" required maxlength="64"></label>
        <label>公网 IP<input v-model="form.publicIp" required></label>
        <label>定位方式<el-select v-model="form.locationSource" aria-label="定位方式"><el-option label="高德定位" value="AMAP" /><el-option label="手工录入" value="MANUAL" /></el-select></label>
        <template v-if="form.locationSource === 'MANUAL'"><label>经度<input v-model="form.longitude" required></label><label>纬度<input v-model="form.latitude" required></label><label>坐标系<el-select v-model="form.coordinateSystem" aria-label="坐标系" placeholder="请选择"><el-option label="WGS84" value="WGS84" /><el-option label="GCJ-02" value="GCJ02" /></el-select></label></template>
        <label class="risk-admin-checkbox"><input v-model="form.enabled" type="checkbox">启用</label>
      </div>
      <div class="risk-admin-form-actions"><button class="risk-admin-button is-primary" type="submit" :disabled="busy">保存</button> <button class="risk-admin-button" type="button" :disabled="busy" @click="editing = false">取消</button></div>
    </form>
  </section>
</template>
