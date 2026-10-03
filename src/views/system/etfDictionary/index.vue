<script setup lang="ts">
import { Refresh, Search } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { getEtfDictionaryPage, getEtfMonitorConfig, setEtfEnabled } from "@/api/etf";
import { useAuthStore } from "@/stores/auth";
import type { EtfDictionaryQuery, EtfDictionaryRow } from "@/types/etf";
import { canAccess } from "@/utils/permission";
import { formatShanghaiDateTime } from "@/utils/stockManagement";
import "@/styles/stockData.css";

const router = useRouter();
const auth = useAuthStore();
const canManage = computed(() => canAccess(auth.permissionCodes, "system:etf-monitor:update") &&
  canAccess(auth.permissionCodes, "system:etf-monitor:view"));
const canViewProfile = computed(() => canAccess(auth.permissionCodes, "system:etf-profile:view"));
const query = reactive<EtfDictionaryQuery>({ pageNum: 1, pageSize: 10, keyword: "", market: undefined, etfType: "" });
const rows = ref<EtfDictionaryRow[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref("");
const submitting = ref("");
const enabled = ref(new Set<string>());
const enabledLoaded = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await getEtfDictionaryPage({ ...query, keyword: query.keyword?.trim() || undefined,
      etfType: query.etfType?.trim() || undefined });
    rows.value = result.list ?? [];
    total.value = Number(result.total ?? 0);
    error.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "ETF 字典读取失败";
  } finally { loading.value = false; }
  if (canManage.value) {
    try { enabled.value = new Set((await getEtfMonitorConfig()).map((item) => item.symbol)); enabledLoaded.value = true; }
    catch { enabledLoaded.value = false; }
  }
}

function search(): void { query.pageNum = 1; void load(); }
function reset(): void { Object.assign(query, { pageNum: 1, pageSize: 10, keyword: "", market: undefined, etfType: "" }); void load(); }

async function enable(row: EtfDictionaryRow): Promise<void> {
  if (!canManage.value || submitting.value || !enabledLoaded.value || enabled.value.has(row.symbol)) return;
  const config = await getEtfMonitorConfig();
  if (config.length >= 10) { ElMessage.warning("ETF 监控已达 10 只上限"); return; }
  try {
    await ElMessageBox.confirm(`将 ${row.name}（${row.symbol}）加入 ETF 监控？`, "启用 ETF 监控", {
      confirmButtonText: "启用", cancelButtonText: "取消", type: "info",
    });
  } catch { return; }
  submitting.value = row.symbol;
  try { await setEtfEnabled(row.symbol, true); await load(); ElMessage.success("已加入 ETF 监控"); }
  catch { /* 请求层已提示错误，保留当前字典结果。 */ }
  finally { submitting.value = ""; }
}

onMounted(load);
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="etf-dictionary-title">
    <header class="stock-page-heading"><div><h1 id="etf-dictionary-title" class="page-title">ETF 字典</h1><p class="page-description">AKShare / 新浪同步的 ETF 基础清单，未知字段留空，不推测跟踪指数。</p></div></header>
    <div class="page-panel stock-filter-panel">
      <el-form class="stock-filter-form" :model="query" inline label-position="top" @submit.prevent="search">
        <el-form-item label="ETF 代码或名称"><el-input v-model.trim="query.keyword" clearable placeholder="输入代码或名称" @keyup.enter="search" /></el-form-item>
        <el-form-item label="市场"><el-select v-model="query.market" clearable placeholder="全部市场"><el-option label="上海" value="SH" /><el-option label="深圳" value="SZ" /></el-select></el-form-item>
        <el-form-item label="ETF 类型"><el-input v-model.trim="query.etfType" clearable placeholder="输入可靠类型" @keyup.enter="search" /></el-form-item>
        <el-form-item class="stock-filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>交易所 ETF 清单</strong><span>共 {{ total }} 条</span></div></div>
      <p v-if="error" class="stock-error" role="alert">{{ error }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="暂无符合条件的 ETF">
        <el-table-column label="ETF" min-width="180" fixed="left"><template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template></el-table-column>
        <el-table-column prop="market" label="市场" width="85" /><el-table-column label="交易所" min-width="100"><template #default="{ row }">{{ row.exchange || "—" }}</template></el-table-column>
        <el-table-column label="类型" min-width="115"><template #default="{ row }">{{ row.etfType || "—" }}</template></el-table-column>
        <el-table-column label="上市状态 / 日期" min-width="150"><template #default="{ row }">{{ row.listingStatus || "—" }} · {{ row.listingDate || "—" }}</template></el-table-column>
        <el-table-column label="跟踪指数" min-width="150"><template #default="{ row }">{{ row.trackingIndexName || row.trackingIndexCode || "暂无可靠数据" }}</template></el-table-column>
        <el-table-column label="来源 / 最近同步" min-width="200"><template #default="{ row }">{{ row.source || "—" }} · {{ formatShanghaiDateTime(row.syncedAt) }}</template></el-table-column>
        <el-table-column v-if="canViewProfile || canManage" label="操作" min-width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewProfile" link type="primary" @click="router.push({ path: '/system/etfProfile', query: { symbol: row.symbol } })">资料</el-button>
            <el-button v-if="canManage" link type="primary" :disabled="!enabledLoaded || enabled.has(row.symbol) || Boolean(submitting)" :loading="submitting === row.symbol" @click="enable(row as EtfDictionaryRow)">{{ enabled.has(row.symbol) ? "已监控" : "加入监控" }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar"><el-pagination v-model:current-page="query.pageNum" v-model:page-size="query.pageSize" :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @change="load" /></div>
    </div>
  </section>
</template>
