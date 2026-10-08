<script setup lang="ts">
import { ArrowDown, ArrowUp, Plus, Refresh, Search, Sort } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";

import { getEtfDictionaryPage, getEtfMonitorConfig, refreshEtfMonitor, setEtfEnabled, sortEtfMonitor } from "@/api/etf";
import { useAuthStore } from "@/stores/auth";
import type { EtfDictionaryRow, EtfMonitorConfig } from "@/types/etf";
import type { MonitorRefreshResult } from "@/types/refresh";
import { refreshFailure, refreshFeedback, refreshSummary } from "@/utils/monitorRefresh";
import { canAccess } from "@/utils/permission";
import { moveEnabledSymbol } from "@/utils/stockManagement";
import "@/styles/stockData.css";

const LIMIT = 10;
const auth = useAuthStore();
const canManage = computed(() => canAccess(auth.permissionCodes, "system:etf-monitor:update"));
const canRefresh = computed(() => canAccess(auth.permissionCodes, "system:etf-monitor:refresh"));
const refreshResult = ref<MonitorRefreshResult | null>(null);
const canSearchDictionary = computed(() => canAccess(auth.permissionCodes, "system:etf-dictionary:view"));
const rows = ref<EtfMonitorConfig[]>([]);
const loaded = ref(false);
const loading = ref(false);
const error = ref("");
const submitting = ref("");
const pickerOpen = ref(false);
const pickerKeyword = ref("");
const pickerRows = ref<EtfDictionaryRow[]>([]);
const pickerLoading = ref(false);
const sortOpen = ref(false);
const order = ref<string[]>([]);
const enabledSymbols = computed(() => new Set(rows.value.map((item) => item.symbol)));

async function load(): Promise<void> {
  loading.value = true;
  try { rows.value = (await getEtfMonitorConfig()).sort((a, b) => a.sortOrder - b.sortOrder); loaded.value = true; error.value = ""; }
  catch (cause) { loaded.value = false; error.value = cause instanceof Error ? cause.message : "ETF 监控清单读取失败"; }
  finally { loading.value = false; }
}

async function searchDictionary(): Promise<void> {
  pickerLoading.value = true;
  try { const result = await getEtfDictionaryPage({ pageNum: 1, pageSize: 20, keyword: pickerKeyword.value.trim() || undefined }); pickerRows.value = result.list ?? []; }
  catch { pickerRows.value = []; }
  finally { pickerLoading.value = false; }
}

function openPicker(): void { pickerOpen.value = true; void searchDictionary(); }

async function toggle(item: EtfMonitorConfig | EtfDictionaryRow, enabled: boolean): Promise<void> {
  if (!canManage.value || submitting.value || !loaded.value) return;
  if (enabled && rows.value.length >= LIMIT) { ElMessage.warning("ETF 监控已达 10 只上限"); return; }
  try { await ElMessageBox.confirm(`${enabled ? "启用" : "停用"} ${item.name}（${item.symbol}）？`, "修改 ETF 监控配置", {
    confirmButtonText: enabled ? "启用" : "停用", cancelButtonText: "取消", type: enabled ? "info" : "warning",
  }); } catch { return; }
  submitting.value = item.symbol;
  try { await setEtfEnabled(item.symbol, enabled); await load(); ElMessage.success("ETF 监控配置已更新"); }
  catch { /* 请求层已提示错误，保留当前配置。 */ }
  finally { submitting.value = ""; }
}

async function openSorter(): Promise<void> {
  if (!canManage.value) return;
  await load();
  if (!loaded.value) return;
  order.value = rows.value.map((item) => item.symbol);
  sortOpen.value = true;
}

function label(symbol: string): string {
  const item = rows.value.find((row) => row.symbol === symbol);
  return item ? `${item.name} · ${symbol}` : symbol;
}

async function saveSort(): Promise<void> {
  if (!canManage.value || submitting.value) return;
  let current: EtfMonitorConfig[];
  try { current = await getEtfMonitorConfig(); }
  catch { ElMessage.error("完整启用清单校验失败"); return; }
  const currentSymbols = new Set(current.map((item) => item.symbol));
  if (order.value.length !== current.length || order.value.some((symbol) => !currentSymbols.has(symbol))) {
    ElMessage.warning("启用清单已变化，请重新打开排序"); sortOpen.value = false; await load(); return;
  }
  submitting.value = "SORT";
  try { await sortEtfMonitor([...order.value]); sortOpen.value = false; await load(); ElMessage.success("ETF 展示顺序已更新"); }
  catch { /* 请求层已提示错误，保留排序草稿。 */ }
  finally { submitting.value = ""; }
}

async function refreshAll(): Promise<void> {
  if (!canRefresh.value || submitting.value) return;
  submitting.value = "REFRESH";
  refreshResult.value = null;
  try {
    const result = await refreshEtfMonitor();
    refreshResult.value = result;
    const feedback = refreshFeedback(result);
    ElMessage[feedback.type](feedback.message);
  } catch (cause) {
    refreshResult.value = refreshFailure(cause);
    const feedback = refreshFeedback(refreshResult.value);
    ElMessage[feedback.type](feedback.message);
  } finally { submitting.value = ""; }
}

onMounted(load);
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="etf-monitor-admin-title">
    <header class="stock-page-heading">
      <div><h1 id="etf-monitor-admin-title" class="page-title">ETF 监控配置</h1><p class="page-description">ETF 与个股各自最多启用 10 只，完整清单独立排序。</p></div>
      <div class="stock-page-actions"><el-button v-if="canManage && canSearchDictionary" type="primary" :icon="Plus" @click="openPicker">从字典选择</el-button><el-button v-if="canManage" :icon="Sort" :disabled="!loaded || rows.length < 2" @click="openSorter">调整顺序</el-button><el-button v-if="canRefresh" :icon="Refresh" :disabled="Boolean(submitting)" :loading="submitting === 'REFRESH'" @click="refreshAll">整体刷新</el-button></div>
    </header>
    <p class="stock-info">已启用 {{ loaded ? rows.length : "—" }} / {{ LIMIT }} 只。普通页面刷新只读取缓存；ETF 新浪行情与雪球资料分别按来源权限展示。</p>
    <p v-if="refreshResult" class="stock-info" role="status">{{ refreshSummary(refreshResult) }}</p>
    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>完整启用清单</strong><span>共 {{ rows.length }} 条</span></div></div>
      <p v-if="error" class="stock-error" role="alert">{{ error }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="尚未启用 ETF">
        <el-table-column label="ETF" min-width="180"><template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template></el-table-column>
        <el-table-column prop="market" label="市场" width="90" /><el-table-column prop="sortOrder" label="展示顺序" width="110" />
        <el-table-column v-if="canManage" label="操作" width="100"><template #default="{ row }"><el-button link type="danger" :disabled="Boolean(submitting)" :loading="submitting === row.symbol" @click="toggle(row as EtfMonitorConfig, false)">停用</el-button></template></el-table-column>
      </el-table>
    </div>
    <el-drawer v-model="pickerOpen" title="从 ETF 字典选择" size="min(560px, 92vw)">
      <div class="stock-drawer-search"><el-input v-model.trim="pickerKeyword" clearable placeholder="代码或名称，最多 20 条" @keyup.enter="searchDictionary" /><el-button :icon="Search" @click="searchDictionary">搜索</el-button></div>
      <div v-loading="pickerLoading" class="stock-drawer-list"><div v-for="item in pickerRows" :key="item.symbol" class="stock-drawer-row"><div><strong>{{ item.name }}</strong><small>{{ item.symbol }} · {{ item.market }}</small></div><el-tag v-if="enabledSymbols.has(item.symbol)" type="success">已启用</el-tag><el-button v-else type="primary" plain :disabled="Boolean(submitting) || !loaded || rows.length >= LIMIT" @click="toggle(item, true)">启用</el-button></div><p v-if="!pickerLoading && !pickerRows.length">没有匹配的 ETF</p></div>
    </el-drawer>
    <el-drawer v-model="sortOpen" title="调整完整启用清单顺序" size="min(560px, 92vw)">
      <p class="stock-sort-note">此处使用全部已启用 ETF，与字典搜索条件无关。</p>
      <div class="stock-drawer-list"><div v-for="(symbol, index) in order" :key="symbol" class="stock-drawer-row"><strong>{{ index + 1 }}. {{ label(symbol) }}</strong><div class="stock-sort-actions"><el-button circle :icon="ArrowUp" aria-label="上移" :disabled="index === 0 || Boolean(submitting)" @click="order = moveEnabledSymbol(order, symbol, -1)" /><el-button circle :icon="ArrowDown" aria-label="下移" :disabled="index === order.length - 1 || Boolean(submitting)" @click="order = moveEnabledSymbol(order, symbol, 1)" /></div></div></div>
      <template #footer><el-button @click="sortOpen = false">取消</el-button><el-button type="primary" :loading="submitting === 'SORT'" @click="saveSort">保存完整顺序</el-button></template>
    </el-drawer>
  </section>
</template>
