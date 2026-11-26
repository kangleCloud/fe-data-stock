<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import RiskResourceStatus from "@/components/risk/RiskResourceStatus.vue";
import RiskMapServers from "@/components/risk/RiskMapServers.vue";
import { getRiskTargets, saveRiskTarget, enableRiskTarget, getRiskConfigSync, getRiskResources } from "@/api/riskMonitor";
import { useRiskConfigPolling } from "@/composables/useRiskConfigPolling";
import { useAuthStore } from "@/stores/auth";
import { ApiError } from "@/utils/request";
import { createRiskPolling } from "@/utils/riskPolling";
import { riskConfigPermission } from "@/utils/riskServer";
import type { RiskManagedTarget, RiskTargetInput, RiskConfigSync, RiskResourceCurrent } from "@/types/riskMonitor";
import "@/styles/riskAdmin.css";

const auth = useAuthStore();
const readable = computed(() => riskConfigPermission(auth.permissionCodes, "view"));
const writable = computed(() => riskConfigPermission(auth.permissionCodes, "update"));
const items = ref<RiskManagedTarget[]>([]);
const sync = ref<RiskConfigSync>();
const resources = ref<RiskResourceCurrent[]>();
const syncError = ref("");
const resourceError = ref("");
const resourceLoading = ref(false);
const error = ref("");
const targetError = ref("");
const message = ref("");
const writing = ref(false);
const targetLoading = ref(false);
const busy = computed(() => writing.value || targetLoading.value);
const page = ref(1); const total = ref(0); const pageSize = 10;
const editing = ref(false);
const confirming = ref(false);
const empty = (): Omit<RiskTargetInput, "connection" | "version"> => ({ targetId: null, alias: "", type: "LOCAL", enabled: true, intervalSeconds: 30, collectorId: "" });
const form = reactive(empty());
const remote = reactive({ host: "", port: 22, username: "", password: "" });
const passwordConfigured = ref(false);
let generation = 0;
let disposed = false;
let refreshOnReturn = false;
const visible = useRiskConfigPolling(() => {
  if (refreshOnReturn) {
    load();
    return;
  }
  if (!busy.value && !editing.value && !confirming.value) targetsPoll.poll();
  syncPoll.poll();
  resourcesPoll.poll();
}, pause);
const canRead = () => visible() && readable.value;
const isCurrent = (token: number) => !disposed && token === generation && readable.value;

const targetsPoll = createRiskPolling({
  auto: false,
  visible: canRead,
  load: () => getRiskTargets(page.value, pageSize),
  accept: result => {
    items.value = result.list;
    total.value = result.total;
    targetError.value = "";
    targetLoading.value = false;
  },
  reject: () => {
    targetError.value = "目标列表读取失败，保留上次成功结果。";
    targetLoading.value = false;
  },
});
const syncPoll = createRiskPolling({
  auto: false,
  visible: canRead,
  load: getRiskConfigSync,
  accept: result => { sync.value = result; syncError.value = ""; },
  reject: () => { syncError.value = "配置同步状态读取失败。"; },
});
const resourcesPoll = createRiskPolling({
  auto: false,
  visible: canRead,
  load: getRiskResources,
  accept: result => {
    resources.value = result.items;
    resourceError.value = "";
    resourceLoading.value = false;
  },
  reject: () => {
    resourceError.value = "资源状态读取失败，保留上次成功结果。";
    resourceLoading.value = false;
  },
});
function pause() {
  targetsPoll.discard();
  syncPoll.discard();
  resourcesPoll.discard();
  targetLoading.value = false;
  resourceLoading.value = false;
}
function loadTargets() {
  if (!canRead()) return;
  targetLoading.value = true;
  targetsPoll.invalidate();
}
function load() {
  if (!readable.value) return;
  refreshOnReturn = !visible();
  if (refreshOnReturn) return;
  error.value = "";
  loadTargets();
  if (resources.value === undefined) resourceLoading.value = true;
  syncPoll.invalidate();
  resourcesPoll.invalidate();
}
function edit(target?: RiskManagedTarget) {
  if (!writable.value) return;
  targetsPoll.discard();
  Object.assign(form, target ? {
    targetId: target.targetId,
    alias: target.alias,
    type: target.type,
    enabled: target.enabled,
    intervalSeconds: target.intervalSeconds,
    collectorId: target.collectorId,
  } : empty());
  Object.assign(remote, { host: target?.connection?.host ?? "", port: target?.connection?.port ?? 22, username: target?.connection?.username ?? "", password: "" });
  passwordConfigured.value = target?.connection?.passwordConfigured ?? false;
  editing.value = true; error.value = "";
}
async function action(operation: () => Promise<unknown>, done: string) {
  if (!canRead() || !writable.value || busy.value) return;
  const token = ++generation;
  targetsPoll.discard();
  writing.value = true;
  error.value = "";
  message.value = "";
  try {
    await operation();
    if (!isCurrent(token) || !writable.value) return;
    message.value = done;
    load();
  } catch (reason) {
    if (isCurrent(token)) {
      const detail = reason instanceof ApiError && reason.code === 404
        ? "该监控目标已不存在，请刷新列表核对。"
        : "操作结果未确认，请刷新列表核对。";
      error.value = editing.value ? detail + "编辑内容已保留。" : detail;
    }
  } finally {
    if (isCurrent(token)) writing.value = false;
  }
}
function save() {
  if (!form.alias.trim() || !form.collectorId.trim() || !Number.isInteger(form.intervalSeconds) || form.intervalSeconds < 1) { error.value = "请填写别名、采集器及有效采集周期。"; return; }
  if (form.type === "REMOTE" && (!remote.host.trim() || !remote.username.trim() || (!remote.password && !passwordConfigured.value) || !Number.isInteger(remote.port) || remote.port < 1 || remote.port > 65535)) { error.value = "请完整填写远程连接信息。"; return; }
  const input: RiskTargetInput = { targetId: form.targetId, version: null, alias: form.alias.trim(), type: form.type, enabled: form.enabled, intervalSeconds: form.intervalSeconds, collectorId: form.collectorId.trim(), connection: form.type === "REMOTE" ? { host: remote.host.trim(), port: remote.port, username: remote.username.trim(), ...(remote.password ? { password: remote.password } : {}) } : null };
  void action(async () => { await saveRiskTarget(input); remote.password = ""; }, "目标已保存，可查看配置同步状态。");
}
async function toggle(target: RiskManagedTarget) {
  if (!writable.value || busy.value || confirming.value) return;
  confirming.value = true;
  try { await ElMessageBox.confirm(`${target.enabled ? "停用" : "启用"}目标 ${target.alias}？`, "修改监控目标", { confirmButtonText: target.enabled ? "停用" : "启用", cancelButtonText: "取消", type: target.enabled ? "warning" : "info" }); }
  catch { return; }
  finally { confirming.value = false; }
  if (disposed || !readable.value || !writable.value || busy.value) return;
  void action(() => enableRiskTarget({ targetId: target.targetId, version: null, enabled: !target.enabled }), "目标状态已更新。");
}
watch([readable, writable], () => {
  generation++;
  refreshOnReturn = false;
  pause();
  writing.value = false;
  targetError.value = "";
  items.value = [];
  resources.value = undefined;
  resourceError.value = "";
  sync.value = undefined;
  syncError.value = "";
  editing.value = false;
  passwordConfigured.value = false;
  Object.assign(form, empty());
  Object.assign(remote, { host: "", port: 22, username: "", password: "" });
  if (readable.value) load();
}, { immediate: true });
onBeforeUnmount(() => {
  disposed = true;
  targetsPoll.stop();
  syncPoll.stop();
  resourcesPoll.stop();
});
</script>

<template>
  <section class="risk-server-config risk-admin" aria-labelledby="risk-config-title">
    <header class="risk-admin-heading"><h1 id="risk-config-title" class="page-title">监控目标管理</h1></header>
    <p v-if="!readable" class="risk-admin-alert is-error" role="alert">需要风控查看与配置查看权限。</p>
    <template v-else>
      <p v-if="error || targetError" class="risk-admin-alert is-error" role="alert">{{ error || targetError }}</p><p v-if="message" class="risk-admin-alert is-success" role="status">{{ message }}</p>
      <RiskMapServers :readable="readable" :writable="writable" />
      <section class="page-panel risk-admin-panel" aria-labelledby="monitor-servers-title">
        <div class="risk-admin-toolbar"><h2 id="monitor-servers-title">系统监控服务器</h2><div class="risk-admin-actions"><button class="risk-admin-button" :disabled="busy" @click="load">刷新</button> <button v-if="writable" class="risk-admin-button is-primary" :disabled="busy" @click="edit()">新增目标</button></div></div>
        <div class="risk-admin-table-wrap"><table class="risk-admin-table"><thead><tr><th>目标</th><th>类型</th><th>采集器</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="target in items" :key="target.targetId"><td><strong>{{ target.alias }}</strong><small>ID {{ target.targetId }}</small></td><td>{{ target.type === 'LOCAL' ? '本地' : '远程' }}</td><td>{{ target.collectorId }}</td><td><span class="risk-admin-tag" :class="{ 'is-enabled': target.enabled }">{{ target.enabled ? '已启用' : '已停用' }}</span></td><td><div class="risk-admin-row-actions"><button v-if="writable" class="risk-admin-link" :disabled="busy" @click="edit(target)">编辑</button> <button v-if="writable" class="risk-admin-link" :disabled="busy" @click="toggle(target)">{{ target.enabled ? '停用' : '启用' }}</button></div></td></tr></tbody></table></div>
        <p v-if="!items.length && !busy && !error && !targetError" class="risk-admin-empty">暂无目标</p><div class="risk-admin-pagination"><button class="risk-admin-button" :disabled="busy || page <= 1" @click="page--; loadTargets()">上一页</button><span>第 {{ page }} 页</span><button class="risk-admin-button" :disabled="busy || page * pageSize >= total" @click="page++; loadTargets()">下一页</button></div>
        <form v-if="editing && writable" class="config-form" @submit.prevent="save">
          <h3>{{ form.targetId ? '编辑目标' : '新增目标' }}</h3>
          <div class="risk-admin-form-grid">
            <label>别名<input v-model="form.alias" required maxlength="64"></label>
            <label>类型<el-select v-model="form.type" aria-label="类型"><el-option label="本地" value="LOCAL" /><el-option label="远程" value="REMOTE" /></el-select></label>
            <label>采集器 ID<input v-model="form.collectorId" required></label><label>采集周期（秒）<input v-model.number="form.intervalSeconds" type="number" min="1" required></label>
            <p v-if="form.type === 'LOCAL'" class="risk-admin-form-note">本机：127.0.0.1</p>
            <template v-else><label>主机<input v-model="remote.host" required></label><label>端口<input v-model.number="remote.port" type="number" min="1" max="65535" required></label><label>用户名<input v-model="remote.username" required></label><label>SSH 密码<input v-model="remote.password" type="password" autocomplete="new-password" :required="!passwordConfigured"><span v-if="passwordConfigured">留空保留原密码</span></label></template>
            <label class="risk-admin-checkbox"><input v-model="form.enabled" type="checkbox">启用</label>
          </div>
          <div class="risk-admin-form-actions"><button class="risk-admin-button is-primary" type="submit" :disabled="busy">保存</button> <button class="risk-admin-button" type="button" :disabled="busy" @click="editing = false; remote.password = ''">取消</button></div>
        </form>
      </section>
      <section class="page-panel risk-admin-panel" aria-labelledby="risk-sync-title">
        <div class="risk-admin-toolbar"><h2 id="risk-sync-title">配置同步</h2></div>
        <p v-if="syncError" class="risk-admin-alert is-error" role="alert">{{ syncError }}</p>
        <p v-if="sync" class="risk-admin-sync">
          {{ sync.status }} · {{ sync.stale ? '已过期' : '未过期' }}<template v-if="sync.failureCode"> · {{ sync.failureCode }}</template>
        </p>
        <p v-else-if="!syncError" class="risk-admin-sync">同步状态不可用</p>
      </section>
      <RiskResourceStatus :resources="resources ?? []" :loading="resourceLoading" :error="resourceError" />
    </template>
  </section>
</template>
