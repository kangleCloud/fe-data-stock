<script setup lang="ts">
import { Refresh, Search } from "@element-plus/icons-vue";
import { onMounted, reactive, ref } from "vue";

import { getStockProfileAdminPage } from "@/api/stockData";
import type { StockProfilePageQuery, StockProfileRow } from "@/types/market";
import { formatAmount } from "@/utils/market";
import { formatShanghaiDateTime } from "@/utils/stockManagement";
import "@/styles/stockData.css";

const query = reactive<StockProfilePageQuery>({ pageNum: 1, pageSize: 10, keyword: "", industry: "" });
const rows = ref<StockProfileRow[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref("");

function formatYuan(value: number | null): string { return formatAmount(value).replace(/^\+/, ""); }

async function loadPage(): Promise<void> {
  loading.value = true;
  try {
    const page = await getStockProfileAdminPage({
      ...query,
      keyword: query.keyword?.trim() || undefined,
      industry: query.industry?.trim() || undefined,
    });
    rows.value = page.list ?? [];
    total.value = Number(page.total ?? 0);
    loadError.value = "";
  } catch (error) {
    rows.value = [];
    total.value = 0;
    loadError.value = error instanceof Error ? error.message : "股票资料加载失败";
  } finally {
    loading.value = false;
  }
}

function search(): void { query.pageNum = 1; void loadPage(); }
function reset(): void {
  Object.assign(query, { pageNum: 1, pageSize: 10, keyword: "", industry: "" });
  void loadPage();
}

onMounted(loadPage);
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="stock-profile-title">
    <header class="stock-page-heading">
      <div>
        <h1 id="stock-profile-title" class="page-title">已同步股票资料</h1>
        <p class="page-description">仅展示选中股票已同步的基础资料；此页只读。</p>
      </div>
    </header>
    <p class="stock-info">这些是 MySQL 保存的历史同步资料。雪球采集总闸关闭时仍可供有权管理员查看；上次同步时间不代表当前报价时间。</p>
    <div class="page-panel stock-filter-panel">
      <el-form class="stock-filter-form" :model="query" inline label-position="top" @submit.prevent="search">
        <el-form-item label="股票代码或名称"><el-input v-model.trim="query.keyword" clearable placeholder="输入代码或名称" @keyup.enter="search" /></el-form-item>
        <el-form-item label="行业"><el-input v-model.trim="query.industry" clearable placeholder="输入行业" @keyup.enter="search" /></el-form-item>
        <el-form-item class="stock-filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>历史同步资料</strong><span>共 {{ total }} 条</span></div></div>
      <p v-if="loadError" class="stock-error" role="alert">{{ loadError }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="暂无符合条件的历史资料">
        <el-table-column label="股票" min-width="180" fixed="left"><template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template></el-table-column>
        <el-table-column prop="market" label="市场" min-width="85" />
        <el-table-column label="行业" min-width="140"><template #default="{ row }">{{ row.industry || "—" }}</template></el-table-column>
        <el-table-column label="上市日期" min-width="130"><template #default="{ row }">{{ row.listingDate || "—" }}</template></el-table-column>
        <el-table-column label="总市值 · 元" min-width="145"><template #default="{ row }">{{ formatYuan(row.marketCap) }}</template></el-table-column>
        <el-table-column label="上次同步时间" min-width="185"><template #default="{ row }">{{ formatShanghaiDateTime(row.updatedAt) }}</template></el-table-column>
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.pageNum" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @change="loadPage"
        />
      </div>
    </div>
  </section>
</template>
