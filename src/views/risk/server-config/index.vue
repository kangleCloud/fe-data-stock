<script setup lang="ts">
import GeoServerStatus from "@/components/risk/GeoServerStatus.vue";
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";
import { getRiskServerConfig, saveRiskServerConfig, resolveRiskServerConfig } from "@/api/riskServer";
import { useAuthStore } from "@/stores/auth";
import type { RiskServerConfig, RiskServerSave, RiskLocation } from "@/types/riskServer";
import { riskConfigPermission, validateRiskServer } from "@/utils/riskServer";
import { riskTime } from "@/utils/riskTime";
const auth = useAuthStore();
const readable = computed(() => riskConfigPermission(auth.permissionCodes, "view"));
const writable = computed(() => riskConfigPermission(auth.permissionCodes, "update"));
const config = shallowRef<RiskServerConfig>();
const form = reactive<RiskServerSave>({ version: null, alias: "", publicIp: "", manualLocation: null });
const manual = ref(false);
const location = reactive({ regionCode: "", longitude: "", latitude: "" });
const busy = ref(false); const message = ref(""); const error = ref(""); let generation = 0; let disposed = false;
function locationText(value: RiskLocation | null) { return value ? `${value.regionCode} · 经度 ${value.longitude}，纬度 ${value.latitude}` : "—"; }
function accept(data: RiskServerConfig) {
  config.value = data; form.version = data.version; form.alias = data.alias ?? ""; form.publicIp = data.publicIp ?? "";
  manual.value = !!data.manualLocation; Object.assign(location, data.manualLocation ?? { regionCode: "", longitude: "", latitude: "" });
}
function failure(value: unknown) {
  const code = (value as { code?: number })?.code;
  error.value = (code === 409 || code === 423) ? "配置版本冲突，请重新读取后核对再保存；当前输入已保留。" : "操作结果未确认，当前配置与输入已保留。请重新读取核对后再操作。";
}
async function run(operation: () => Promise<RiskServerConfig>, action: "view" | "update") {
  if (busy.value || !readable.value || (action === "update" && !writable.value)) return;
  const current = ++generation; busy.value = true; error.value = ""; message.value = "";
  try { const result = await operation(); if (!disposed && current === generation && readable.value && (action === "view" || writable.value)) { accept(result); message.value = action === "view" ? "配置已读取" : "配置已保存/更新；定位状态以服务端结果为准"; } }
  catch (value) { if (!disposed && current === generation) failure(value); }
  finally { if (!disposed && current === generation) busy.value = false; }
}
function load() { return run(getRiskServerConfig, "view"); }
function save() {
  const input: RiskServerSave = { version: form.version, alias: form.alias.trim(), publicIp: form.publicIp.trim(), manualLocation: manual.value ? { ...location } : null };
  const invalid = validateRiskServer(input); if (invalid) { error.value = invalid; return; }
  return run(() => saveRiskServerConfig(input), "update");
}
function resolve() { const version = config.value?.version; if (version) return run(() => resolveRiskServerConfig(version), "update"); }
watch([readable, writable], () => { generation++; busy.value = false; config.value = undefined; form.version = null; form.alias = ""; form.publicIp = ""; manual.value = false; Object.assign(location, { regionCode: "", longitude: "", latitude: "" }); if (readable.value) void load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; });
</script>
<template>
  <section class="risk-server-config" aria-label="风控服务器目标配置">
    <h1>服务器目标配置</h1><p>北京时间 · 单一服务器目标。人工位置优先；解析失败不影响合法配置的保存。</p>
    <p v-if="!readable" role="alert">需要 system:risk:view 和 system:risk:config:view 才能读取完整公网IP配置。</p>
    <template v-else>
      <p v-if="error" class="risk-warning" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p><p v-if="busy" role="status">正在处理…</p>
      <form class="config-form" @submit.prevent="save">
        <label>服务器别名<input v-model="form.alias" :disabled="!writable || busy" maxlength="64" autocomplete="off"></label>
        <label>公网IP<input v-model="form.publicIp" :disabled="!writable || busy" autocomplete="off" spellcheck="false"></label>
        <label><span>使用人工位置</span><input v-model="manual" type="checkbox" :disabled="!writable || busy"></label>
        <template v-if="manual"><label>地域编码<input v-model="location.regionCode" :disabled="!writable || busy" placeholder="CN-31 / US"></label><label>经度<input v-model="location.longitude" :disabled="!writable || busy" inputmode="decimal"></label><label>纬度<input v-model="location.latitude" :disabled="!writable || busy" inputmode="decimal"></label></template>
        <button type="button" :disabled="busy" @click="load">重新读取</button><button v-if="writable" type="submit" :disabled="busy">保存配置</button><button v-if="writable" type="button" :disabled="busy || !config?.version" @click="resolve">重新解析已保存IP</button>
      </form>
      <p v-if="!writable">当前只读，更新还需 system:risk:config:update。</p>
      <p>定位使用本地数据库或有效缓存，不调用在线定位、不发送访客 IP。重新读取会替换当前输入。</p>
      <GeoServerStatus v-if="config" :status="config.geoStatus" :manual="config.locationSource === 'MANUAL'" /><dl v-if="config"><dt>配置状态</dt><dd>{{ config.configured ? '已配置' : '未配置' }}</dd><dt>位置 / 解析状态</dt><dd>{{ config.locationStatus }} / {{ config.resolveStatus }}</dd><dt>位置来源</dt><dd>{{ config.locationSource ?? '—' }}</dd><dt>有效人工位置</dt><dd>{{ locationText(config.manualLocation) }}</dd><dt>解析位置</dt><dd>{{ locationText(config.resolvedLocation) }}</dd><dt>解析失败分类</dt><dd>{{ config.resolveFailureCode ?? '—' }}</dd><dt>解析时间</dt><dd>{{ riskTime(config.resolvedAt) }}</dd><dt>更新时间</dt><dd>{{ riskTime(config.updatedAt) }}</dd></dl>
    </template>
  </section>
</template>
<style scoped>
.risk-server-config { padding: 24px; background: var(--el-bg-color); color: var(--el-text-color-primary); border: 1px solid var(--el-border-color-light); border-radius: 8px; }
h1 { margin: 0 0 12px; font-size: 22px; }
p { line-height: 1.7; }
.config-form { display: grid; gap: 18px; max-width: 640px; margin: 24px 0; }
label { display: grid; gap: 8px; font-size: 14px; }
input:not([type="checkbox"]) { box-sizing: border-box; width: 100%; min-height: 36px; border: 1px solid var(--el-border-color); border-radius: 4px; padding: 8px 12px; background: var(--el-fill-color-blank); color: var(--el-text-color-primary); font: inherit; }
input[type="checkbox"] { width: 20px; height: 20px; }
button { min-height: 36px; padding: 8px 16px; border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--el-fill-color-blank); color: var(--el-text-color-primary); cursor: pointer; }
button[type="submit"] { background: var(--el-color-primary); color: var(--el-color-white); border-color: var(--el-color-primary); }
button:disabled, input:disabled { cursor: not-allowed; opacity: .6; }
:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; }
.risk-warning { color: var(--el-color-danger); }
dl { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 14px; padding-top: 20px; border-top: 1px solid var(--el-border-color-light); }
dd { margin: 0; overflow-wrap: anywhere; } dt { color: var(--el-text-color-secondary); }
@media (max-width: 600px) { .risk-server-config { padding: 16px; } dl { grid-template-columns: 1fr; gap: 8px; } dd { margin-bottom: 8px; } }
</style>
