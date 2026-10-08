<script setup lang="ts">
import { ArrowDown, ArrowUp, Plus, Refresh, Search, Sort } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";

import {
  getStockMonitorConfig,
  getStockMonitorRefreshStatus,
  refreshStockMonitor,
  searchStockDictionary,
  setStockEnabled,
  sortStockMonitor,
} from "@/api/market";
import { getStockMonitorAdminPage } from "@/api/stockData";
import { useAuthStore } from "@/stores/auth";
import type {
  StockMonitorAdminRow,
  StockMonitorConfig,
  StockMonitorPageQuery,
  StockMonitorRefreshStatus,
  StockSymbol,
} from "@/types/market";
import { canAccess } from "@/utils/permission";
import { refreshFailure, refreshFeedback, refreshSummary } from "@/utils/monitorRefresh";
import { formatShanghaiDateTime, moveEnabledSymbol } from "@/utils/stockManagement";
import "@/styles/stockData.css";

const LIMIT = 10;
const authStore = useAuthStore();
const canManage = computed(() => canAccess(authStore.permissionCodes, "system:stock-monitor:update"));
const canRefresh = computed(() => canAccess(authStore.permissionCodes, "system:stock-monitor:refresh"));
const query = reactive<StockMonitorPageQuery>({ pageNum: 1, pageSize: 10, keyword: "", enabled: undefined });
const rows = ref<StockMonitorAdminRow[]>([]);
const total = ref(0);
const loading = ref(false);
const listLoading = ref(false);
const loadError = ref("");
const enabledList = ref<StockMonitorConfig[]>([]);
const enabledLoaded = ref(false);
const refreshStatus = ref<StockMonitorRefreshStatus | null>(null);
const submitting = ref("");
const pickerOpen = ref(false);
const pickerLoading = ref(false);
const pickerKeyword = ref("");
const pickerRows = ref<StockSymbol[]>([]);
const sortOpen = ref(false);
const sortSymbols = ref<string[]>([]);
const enabledSymbols = computed(() => new Set(enabledList.value.map((item) => item.symbol)));

async function loadPage(): Promise<void> {
  loading.value = true;
  try {
    const page = await getStockMonitorAdminPage({ ...query, keyword: query.keyword?.trim() || undefined });
    rows.value = page.list ?? [];
    total.value = Number(page.total ?? 0);
    loadError.value = "";
  } catch (error) {
    rows.value = [];
    total.value = 0;
    loadError.value = error instanceof Error ? error.message : "监控配置加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadEnabledList(): Promise<void> {
  listLoading.value = true;
  try {
    enabledList.value = (await getStockMonitorConfig()).sort((a, b) => a.sortOrder - b.sortOrder);
    enabledLoaded.value = true;
  } catch {
    enabledList.value = [];
    enabledLoaded.value = false;
  } finally {
    listLoading.value = false;
  }
}

async function loadRefreshStatus(): Promise<void> {
  try { refreshStatus.value = await getStockMonitorRefreshStatus(); }
  catch { refreshStatus.value = null; }
}

function search(): void {
  query.pageNum = 1;
  void loadPage();
}

function reset(): void {
  Object.assign(query, { pageNum: 1, pageSize: 10, keyword: "", enabled: undefined });
  void loadPage();
}

async function searchPicker(): Promise<void> {
  pickerLoading.value = true;
  try {
    pickerRows.value = await searchStockDictionary(pickerKeyword.value.trim(), 20);
  } catch {
    pickerRows.value = [];
  } finally {
    pickerLoading.value = false;
  }
}

function openPicker(): void {
  pickerOpen.value = true;
  void searchPicker();
}

async function toggleStock(item: StockSymbol, enabled: boolean): Promise<void> {
  if (!canManage.value || submitting.value) return;
  if (enabled && (!enabledLoaded.value || enabledList.value.length >= LIMIT)) {
    ElMessage.warning("启用数量已达上限，或完整启用清单尚未加载");
    return;
  }
  try {
    await ElMessageBox.confirm(`${enabled ? "启用" : "停用"} ${item.name}（${item.symbol}）？`, "修改个股监控配置", {
      confirmButtonText: enabled ? "启用" : "停用", cancelButtonText: "取消",
      type: enabled ? "info" : "warning",
    });
  } catch { return; }
  submitting.value = item.symbol;
  try {
    await setStockEnabled(item.symbol, enabled);
    if (!enabled && rows.value.length === 1 && query.pageNum > 1) query.pageNum -= 1;
    await Promise.all([loadPage(), loadEnabledList()]);
    ElMessage.success("监控配置已更新");
  } finally {
    submitting.value = "";
  }
}

async function openSorter(): Promise<void> {
  if (!canManage.value) return;
  await loadEnabledList();
  if (!enabledLoaded.value) {
    ElMessage.error("完整启用清单加载失败，暂不能排序");
    return;
  }
  sortSymbols.value = enabledList.value.map((item) => item.symbol);
  sortOpen.value = true;
}

function sortLabel(symbol: string): string {
  const item = enabledList.value.find((stock) => stock.symbol === symbol);
  return item ? `${item.name} · ${symbol}` : symbol;
}

async function saveSort(): Promise<void> {
  if (!canManage.value || submitting.value) return;
  let current: StockMonitorConfig[];
  try {
    current = await getStockMonitorConfig();
  } catch {
    ElMessage.error("完整启用清单校验失败，请稍后重试");
    return;
  }
  const currentSymbols = current.map((item) => item.symbol);
  if (sortSymbols.value.length !== currentSymbols.length ||
    sortSymbols.value.some((symbol) => !currentSymbols.includes(symbol))) {
    ElMessage.warning("启用清单已变化，请重新打开排序");
    sortOpen.value = false;
    await loadEnabledList();
    return;
  }
  submitting.value = "SORT";
  try {
    await sortStockMonitor([...sortSymbols.value]);
    sortOpen.value = false;
    await Promise.all([loadPage(), loadEnabledList()]);
    ElMessage.success("完整启用清单顺序已更新");
  } finally {
    submitting.value = "";
  }
}

async function refreshAll(): Promise<void> {
  if (!canRefresh.value || submitting.value) return;
  submitting.value = "REFRESH";
  refreshStatus.value = null;
  try {
    const result = await refreshStockMonitor();
    refreshStatus.value = result;
    const feedback = refreshFeedback(result);
    ElMessage[feedback.type](feedback.message);
  } catch (cause) {
    refreshStatus.value = refreshFailure(cause);
    const feedback = refreshFeedback(refreshStatus.value);
    ElMessage[feedback.type](feedback.message);
  } finally {
    submitting.value = "";
  }
}

onMounted(() => { void Promise.all([loadPage(), loadEnabledList(), loadRefreshStatus()]); });
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="stock-monitor-title">
    <header class="stock-page-heading">
      <div>
        <h1 id="stock-monitor-title" class="page-title">个股监控配置</h1>
        <p class="page-description">系统级清单最多启用 10 只股票。报价与曲线仅由采集缓存提供。</p>
      </div>
      <div class="stock-page-actions">
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openPicker">从字典选股</el-button>
        <el-button v-if="canManage" :icon="Sort" :disabled="!enabledLoaded || listLoading || enabledList.length < 2" @click="openSorter">调整顺序</el-button>
        <el-button v-if="canRefresh" :icon="Refresh" :disabled="Boolean(submitting)" :loading="submitting === 'REFRESH'" @click="refreshAll">整体刷新</el-button>
      </div>
    </header>

    <p class="stock-info">已启用 {{ enabledLoaded ? enabledList.length : "—" }} / {{ LIMIT }} 只。资料为历史同步记录，最后同步时间以资料页显示为准；整体刷新遵循服务端雪球总闸。</p>
    <p v-if="refreshStatus" class="stock-info" role="status">{{ refreshSummary(refreshStatus) }}</p>

    <div class="page-panel stock-filter-panel">
      <el-form class="stock-filter-form" :model="query" inline label-position="top" @submit.prevent="search">
        <el-form-item label="股票代码或名称"><el-input v-model.trim="query.keyword" clearable placeholder="输入代码或名称" @keyup.enter="search" /></el-form-item>
        <el-form-item label="启用状态">
          <el-select v-model="query.enabled" clearable placeholder="全部状态">
            <el-option label="已启用" :value="true" /><el-option label="已停用" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item class="stock-filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>

    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>配置列表</strong><span>共 {{ total }} 条</span></div></div>
      <p v-if="loadError" class="stock-error" role="alert">{{ loadError }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="暂无符合条件的监控配置">
        <el-table-column label="股票" min-width="165" fixed="left">
          <template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template>
        </el-table-column>
        <el-table-column prop="market" label="市场" width="85" />
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? "已启用" : "已停用" }}</el-tag></template></el-table-column>
        <el-table-column label="显示顺序" width="110"><template #default="{ row }">{{ row.enabled ? row.sortOrder : "—" }}</template></el-table-column>
        <el-table-column label="已同步行业" min-width="140"><template #default="{ row }">{{ row.profile?.industry || "—" }}</template></el-table-column>
        <el-table-column label="资料上次同步" min-width="170"><template #default="{ row }">{{ formatShanghaiDateTime(row.profile?.updatedAt) }}</template></el-table-column>
        <el-table-column v-if="canManage" label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              link :type="row.enabled ? 'danger' : 'primary'" :loading="submitting === row.symbol"
              :disabled="Boolean(submitting) || (!row.enabled && (!enabledLoaded || enabledList.length >= LIMIT))"
              @click="toggleStock(row as StockMonitorAdminRow, !row.enabled)"
            >
              {{ row.enabled ? "停用" : "启用" }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.pageNum" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @change="loadPage"
        />
      </div>
    </div>

    <el-drawer v-model="pickerOpen" title="从交易所字典选择股票" size="min(560px, 92vw)">
      <div class="stock-drawer-search"><el-input v-model.trim="pickerKeyword" clearable placeholder="输入代码或名称，最多 20 条" @keyup.enter="searchPicker" /><el-button :icon="Search" @click="searchPicker">搜索</el-button></div>
      <div v-loading="pickerLoading" class="stock-drawer-list">
        <div v-for="item in pickerRows" :key="item.symbol" class="stock-drawer-row">
          <div><strong>{{ item.name }}</strong><small>{{ item.symbol }} · {{ item.market }}</small></div>
          <el-tag v-if="enabledSymbols.has(item.symbol)" type="success">已启用</el-tag>
          <el-button v-else type="primary" plain :loading="submitting === item.symbol" :disabled="Boolean(submitting) || !enabledLoaded || enabledList.length >= LIMIT" @click="toggleStock(item, true)">启用</el-button>
        </div>
        <p v-if="!pickerLoading && !pickerRows.length">没有匹配的交易所股票</p>
      </div>
    </el-drawer>

    <el-drawer v-model="sortOpen" title="调整完整启用清单顺序" size="min(560px, 92vw)">
      <p class="stock-sort-note">此处始终使用全部已启用股票，当前表格的查询条件不会影响排序。</p>
      <div class="stock-drawer-list">
        <div v-for="(symbol, index) in sortSymbols" :key="symbol" class="stock-drawer-row">
          <strong>{{ index + 1 }}. {{ sortLabel(symbol) }}</strong>
          <div class="stock-sort-actions">
            <el-button circle :icon="ArrowUp" aria-label="上移" :disabled="index === 0 || Boolean(submitting)" @click="sortSymbols = moveEnabledSymbol(sortSymbols, symbol, -1)" />
            <el-button circle :icon="ArrowDown" aria-label="下移" :disabled="index === sortSymbols.length - 1 || Boolean(submitting)" @click="sortSymbols = moveEnabledSymbol(sortSymbols, symbol, 1)" />
          </div>
        </div>
      </div>
      <template #footer><el-button @click="sortOpen = false">取消</el-button><el-button type="primary" :loading="submitting === 'SORT'" @click="saveSort">保存完整顺序</el-button></template>
    </el-drawer>
  </section>
</template>
