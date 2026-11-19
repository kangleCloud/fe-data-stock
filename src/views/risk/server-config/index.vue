<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import RiskResourceStatus from "@/components/risk/RiskResourceStatus.vue";
import { getRiskTargets, saveRiskTarget, enableRiskTarget, getRiskConfigSync, retryRiskConfigSync, getRiskResources } from "@/api/riskMonitor";
import { useAuthStore } from "@/stores/auth";
import { riskConfigPermission, riskCoordinate } from "@/utils/riskServer";
import type { RiskManagedTarget, RiskTargetInput, RiskConfigSync, RiskResourceCurrent } from "@/types/riskMonitor";

const auth = useAuthStore();
const readable = computed(() => riskConfigPermission(auth.permissionCodes, "view"));
const writable = computed(() => riskConfigPermission(auth.permissionCodes, "update"));
const items = ref<RiskManagedTarget[]>([]);
const sync = ref<RiskConfigSync>();
const resources = ref<RiskResourceCurrent[]>([]);
const resourceError = ref("");
let refreshTicks = 0;
const clock = setInterval(() => {
  if (++refreshTicks >= 10) {
    refreshTicks = 0;
    if (document.visibilityState !== "hidden" && readable.value && !busy.value && !editing.value) void load();
  }
}, 1000);
const error = ref(""); const message = ref(""); const busy = ref(false);
const page = ref(1); const total = ref(0); const pageSize = 10;
const editing = ref(false); const manual = ref(false);
const empty = (): RiskTargetInput => ({ targetId: null, version: null, alias: "", type: "LOCAL", enabled: true, intervalSeconds: 30, collectorId: "", logSourceId: null, connection: null, publicIp: null, manualLocation: null });
const form = reactive<RiskTargetInput>(empty());
const remote = reactive({ host: "", port: 22, username: "", credentialAlias: "" });
const location = reactive({ regionCode: "", longitude: "", latitude: "" });
let generation = 0; let disposed = false;
const isCurrent = (token: number) => !disposed && token === generation && readable.value;
async function load() {
  if (!readable.value) return;
  const token = ++generation; busy.value = true; error.value = "";
  const [listResult, syncResult, resourceResult] = await Promise.allSettled([getRiskTargets(page.value, pageSize), getRiskConfigSync(), getRiskResources()]);
  if (!isCurrent(token)) return;
  if (listResult.status === "fulfilled") { items.value = listResult.value.list; total.value = listResult.value.total; }
  else error.value = "目标列表读取失败，保留上次成功结果。";
  if (syncResult.status === "fulfilled") sync.value = syncResult.value; else error.value += " 配置同步状态读取失败。";
  if (resourceResult.status === "fulfilled") { resources.value = resourceResult.value.items; resourceError.value = ""; } else resourceError.value = "资源状态读取失败，保留上次成功结果。";
  busy.value = false;
}
function edit(target?: RiskManagedTarget) {
  if (!writable.value) return;
  Object.assign(form, target ? { ...target } : empty());
  Object.assign(remote, target?.connection ?? { host: "", port: 22, username: "", credentialAlias: "" });
  Object.assign(location, target?.manualLocation ?? { regionCode: "", longitude: "", latitude: "" });
  manual.value = !!target?.manualLocation; editing.value = true; error.value = "";
}
async function action(operation: () => Promise<unknown>, done: string) {
  if (!readable.value || !writable.value || busy.value) return;
  const token = ++generation; busy.value = true; error.value = ""; message.value = "";
  try { await operation(); if (!isCurrent(token) || !writable.value) return; message.value = done; busy.value = false; await load(); }
  catch (reason) { if (isCurrent(token)) { error.value = (reason as { code?: number })?.code === 423 ? "配置版本冲突，请重新读取后核对；输入已保留。" : "操作结果未确认，请重新读取核对；输入已保留。"; busy.value = false; } }
}
function save() {
  if (!form.alias.trim() || !form.collectorId.trim() || !Number.isInteger(form.intervalSeconds) || form.intervalSeconds < 1) { error.value = "请填写别名、采集器及有效采集周期。"; return; }
  if (form.type === "REMOTE" && (!remote.host.trim() || !remote.username.trim() || !remote.credentialAlias.trim() || !Number.isInteger(remote.port) || remote.port < 1 || remote.port > 65535)) { error.value = "请完整填写远程连接信息。"; return; }
  if (manual.value && (!location.regionCode.trim() || riskCoordinate(location.longitude, 180) === undefined || riskCoordinate(location.latitude, 90) === undefined)) { error.value = "请完整填写有效的人工位置。"; return; }
  const input: RiskTargetInput = { targetId: form.targetId, version: form.version, alias: form.alias.trim(), type: form.type, enabled: form.enabled, intervalSeconds: form.intervalSeconds, collectorId: form.collectorId.trim(), logSourceId: form.type === "LOCAL" ? form.logSourceId?.trim() || null : null, connection: form.type === "REMOTE" ? { ...remote } : null, publicIp: form.publicIp?.trim() || null, manualLocation: manual.value ? { ...location } : null };
  void action(() => saveRiskTarget(input), "目标已保存；配置发布状态以服务端返回为准。");
}
function toggle(target: RiskManagedTarget) {
  if (!window.confirm(`确认${target.enabled ? "停用" : "启用"}目标 ${target.alias}？`)) return;
  void action(() => enableRiskTarget({ targetId: target.targetId, version: target.version, enabled: !target.enabled }), "目标状态已更新。");
}
watch([readable, writable], () => { generation++; busy.value = false; items.value = []; resources.value = []; resourceError.value = ""; sync.value = undefined; editing.value = false; manual.value = false; Object.assign(form, empty()); Object.assign(remote, { host: "", port: 22, username: "", credentialAlias: "" }); Object.assign(location, { regionCode: "", longitude: "", latitude: "" }); if (readable.value) void load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; clearInterval(clock); });
</script>

<template>
  <section class="risk-server-config" aria-label="风控监控目标管理">
    <h1>监控目标管理</h1>
    <p v-if="!readable" role="alert">需要风控查看与配置查看权限。</p>
    <template v-else>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
      <button :disabled="busy" @click="load">刷新</button> <button v-if="writable" :disabled="busy" @click="edit()">新增目标</button>
      <div class="table-wrap"><table><thead><tr><th>目标</th><th>类型</th><th>采集器</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="target in items" :key="target.targetId"><td>{{ target.alias }}（{{ target.targetId }}）</td><td>{{ target.type }}</td><td>{{ target.collectorId }}</td><td>{{ target.enabled ? '已启用' : '已停用' }}</td><td><button v-if="writable" :disabled="busy" @click="edit(target)">编辑</button> <button v-if="writable" :disabled="busy" @click="toggle(target)">{{ target.enabled ? '停用' : '启用' }}</button></td></tr></tbody></table></div>
      <p v-if="!items.length && !busy && !error">暂无目标</p><p><button :disabled="busy || page <= 1" @click="page--; load()">上一页</button> 第 {{ page }} 页 <button :disabled="busy || page * pageSize >= total" @click="page++; load()">下一页</button></p>
      <form v-if="editing && writable" class="config-form" @submit.prevent="save">
        <h2>{{ form.targetId ? '编辑目标' : '新增目标' }}</h2>
        <label>别名<input v-model="form.alias" required maxlength="64"></label>
        <label>类型<select v-model="form.type"><option value="LOCAL">本地</option><option value="REMOTE">远程</option></select></label>
        <label>采集器 ID<input v-model="form.collectorId" required></label><label>采集周期（秒）<input v-model.number="form.intervalSeconds" type="number" min="1" required></label>
        <label><input v-model="form.enabled" type="checkbox">启用</label>
        <label v-if="form.type === 'LOCAL'">日志源 ID<input v-model="form.logSourceId"></label>
        <template v-else><label>主机<input v-model="remote.host" required></label><label>端口<input v-model.number="remote.port" type="number" min="1" max="65535" required></label><label>用户名<input v-model="remote.username" required></label><label>密钥别名<input v-model="remote.credentialAlias" required></label></template>
        <label>公网 IP<input v-model="form.publicIp"></label><label><input v-model="manual" type="checkbox">使用人工位置</label>
        <template v-if="manual"><label>地域编码<input v-model="location.regionCode" required></label><label>经度<input v-model="location.longitude" required></label><label>纬度<input v-model="location.latitude" required></label></template>
        <div><button type="submit" :disabled="busy">保存</button> <button type="button" :disabled="busy" @click="editing = false">取消</button></div>
      </form>
      <section><h2>配置同步</h2><p v-if="sync">{{ sync.status }} · {{ sync.stale ? '已过期' : '未过期' }} · 配置版本 {{ sync.configVersion ?? '—' }} · 发布版本 {{ sync.redisConfigVersion ?? '—' }} · {{ sync.failureCode ?? '无失败码' }}</p><p v-else>同步状态不可用</p><button v-if="writable && sync?.retryable" :disabled="busy" @click="action(retryRiskConfigSync, '已请求重试发布。')">重试同步</button></section>
      <RiskResourceStatus :resources="resources" :loading="busy" :error="resourceError" />
    </template>
  </section>
</template>
<style scoped>
.risk-server-config { padding: 24px; background: var(--el-bg-color); color: var(--el-text-color-primary); }
.table-wrap { overflow-x: auto; margin-top: 16px; } table { border-collapse: collapse; width: 100%; } th, td { padding: 10px; border-bottom: 1px solid var(--el-border-color-light); text-align: left; }
.config-form { display: grid; gap: 12px; max-width: 640px; margin: 24px 0; } label { display: grid; gap: 6px; } input, select, button { min-height: 36px; font: inherit; } input[type=checkbox] { min-height: auto; } button { cursor: pointer; } button:disabled { cursor: not-allowed; } :focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; } section section { margin-top: 24px; } @media (max-width: 600px) { .risk-server-config { padding: 16px; } }
</style>
