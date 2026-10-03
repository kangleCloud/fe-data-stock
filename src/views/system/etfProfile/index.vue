<script setup lang="ts">
import { Refresh, Search } from "@element-plus/icons-vue";
import { onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { getEtfMonitorDashboard, getEtfProfileDetail, getEtfProfilePage } from "@/api/etf";
import type { EtfMonitorItem, EtfProfileDetail, EtfProfileQuery, EtfProfileRow } from "@/types/etf";
import { dataStatusLabels, formatAmount, formatPercent, formatPlainNumber } from "@/utils/market";
import { formatShanghaiDateTime } from "@/utils/stockManagement";
import "@/styles/stockData.css";

const route = useRoute();
const query = reactive<EtfProfileQuery>({ pageNum: 1, pageSize: 10, keyword: "", etfType: "", trackingIndexCode: "" });
const rows = ref<EtfProfileRow[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref("");
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref("");
const detail = ref<EtfProfileDetail | null>(null);
const publicQuote = ref<EtfMonitorItem | null>(null);
const publicQuoteError = ref(false);
let detailRequestId = 0;

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await getEtfProfilePage({ ...query, keyword: query.keyword?.trim() || undefined,
      etfType: query.etfType?.trim() || undefined,
      trackingIndexCode: query.trackingIndexCode?.trim() || undefined });
    rows.value = result.list ?? [];
    total.value = Number(result.total ?? 0);
    error.value = "";
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "ETF 资料读取失败"; }
  finally { loading.value = false; }
}

async function openDetail(symbol: string): Promise<void> {
  const requestId = ++detailRequestId;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = "";
  detail.value = null;
  publicQuote.value = null;
  publicQuoteError.value = false;
  const [profileResult, dashboardResult] = await Promise.allSettled([
    getEtfProfileDetail(symbol), getEtfMonitorDashboard(),
  ]);
  if (requestId !== detailRequestId) return;
  if (profileResult.status === "fulfilled") detail.value = profileResult.value;
  else detailError.value = profileResult.reason instanceof Error ? profileResult.reason.message : "ETF 详情读取失败";
  if (dashboardResult.status === "fulfilled") {
    publicQuote.value = dashboardResult.value.etfs.find((item) => item.symbol === symbol) ?? null;
  } else publicQuoteError.value = true;
  detailLoading.value = false;
}

function search(): void { query.pageNum = 1; void load(); }
function reset(): void { Object.assign(query, { pageNum: 1, pageSize: 10, keyword: "", etfType: "", trackingIndexCode: "" }); void load(); }

onMounted(() => { void load(); });
watch(() => route.query.symbol, (symbol) => {
  if (typeof symbol === "string" && symbol) void openDetail(symbol);
}, { immediate: true });
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="etf-profile-title">
    <header class="stock-page-heading"><div><h1 id="etf-profile-title" class="page-title">ETF 资料</h1><p class="page-description">基础资料、可靠跟踪指数和最近实际取得的资产配置报告。</p></div></header>
    <p class="stock-info">资产配置仅为资产类别占比，不是成分股持仓；请求报告期不是已核实披露日。资料同步时间与行情时间分别标注。</p>
    <div class="page-panel stock-filter-panel">
      <el-form class="stock-filter-form" :model="query" inline label-position="top" @submit.prevent="search">
        <el-form-item label="ETF 代码或名称"><el-input v-model.trim="query.keyword" clearable placeholder="输入代码或名称" @keyup.enter="search" /></el-form-item>
        <el-form-item label="ETF 类型"><el-input v-model.trim="query.etfType" clearable placeholder="输入类型" @keyup.enter="search" /></el-form-item>
        <el-form-item label="跟踪指数代码"><el-input v-model.trim="query.trackingIndexCode" clearable placeholder="已核实代码" @keyup.enter="search" /></el-form-item>
        <el-form-item class="stock-filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>已同步 ETF 资料</strong><span>共 {{ total }} 条</span></div></div>
      <p v-if="error" class="stock-error" role="alert">{{ error }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="暂无符合条件的 ETF 资料">
        <el-table-column label="ETF" min-width="180" fixed="left"><template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template></el-table-column>
        <el-table-column prop="market" label="市场" width="85" />
        <el-table-column label="ETF 类型" min-width="120"><template #default="{ row }">{{ row.etfType || "—" }}</template></el-table-column>
        <el-table-column label="跟踪指数" min-width="170"><template #default="{ row }">{{ row.trackingIndexName || row.trackingIndexCode || "暂无可靠数据" }}</template></el-table-column>
        <el-table-column label="管理人" min-width="140"><template #default="{ row }">{{ row.manager || "—" }}</template></el-table-column>
        <el-table-column label="上市日期" width="125"><template #default="{ row }">{{ row.listingDate || "—" }}</template></el-table-column>
        <el-table-column label="份额 / 数据日期" min-width="170"><template #default="{ row }">{{ formatPlainNumber(row.shareCount) }} · {{ row.shareDate || "—" }}</template></el-table-column>
        <el-table-column label="资料采集日期" min-width="125"><template #default="{ row }">{{ row.updatedAt?.slice(0, 10) || "—" }}</template></el-table-column>
        <el-table-column label="资料状态" min-width="125"><template #default="{ row }">{{ row.updatedAt ? "已同步 · 非实时" : "缺失" }}</template></el-table-column>
        <el-table-column label="最近同步" min-width="165"><template #default="{ row }">{{ formatShanghaiDateTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="95" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row.symbol)">查看详情</el-button></template></el-table-column>
      </el-table>
      <div class="pagination-bar"><el-pagination v-model:current-page="query.pageNum" v-model:page-size="query.pageSize" :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @change="load" /></div>
    </div>
    <el-drawer v-model="detailOpen" title="ETF 资料详情" size="min(680px, 94vw)">
      <p v-if="detailError" class="stock-error" role="alert">{{ detailError }}</p>
      <div v-loading="detailLoading" class="etf-detail">
        <template v-if="detail">
          <h2>{{ detail.name }} <small>{{ detail.symbol }}</small></h2>
          <RouterLink :to="{ path: '/market/etf-monitor', query: { symbol: detail.symbol } }">查看公开行情与价格采样（若已监控）</RouterLink>
          <h3>基础资料</h3>
          <dl><div><dt>市场 / 交易所</dt><dd>{{ detail.market }} / {{ detail.exchange || "—" }}</dd></div><div><dt>ETF 类型</dt><dd>{{ detail.etfType || "—" }}</dd></div><div><dt>上市状态 / 日期</dt><dd>{{ detail.listingStatus || "—" }} / {{ detail.listingDate || "—" }}</dd></div><div><dt>管理人 / 托管人</dt><dd>{{ detail.manager || "—" }} / {{ detail.custodian || "—" }}</dd></div><div><dt>最近同步</dt><dd>{{ formatShanghaiDateTime(detail.updatedAt) }}</dd></div></dl>
          <h3>跟踪指数与份额</h3>
          <dl><div><dt>已核实跟踪指数</dt><dd>{{ detail.trackingIndexName || "暂无可靠数据" }} · {{ detail.trackingIndexCode || "—" }}</dd></div><div><dt>基金份额</dt><dd>{{ formatPlainNumber(detail.shareCount) }}</dd></div><div><dt>份额数据日期</dt><dd>{{ detail.shareDate || "—" }}</dd></div></dl>
          <h3>最近公开行情</h3>
          <p v-if="publicQuoteError" role="status">公开行情缓存暂不可用。</p>
          <p v-else-if="!publicQuote">该 ETF 未启用监控，暂无公开缓存行情。</p>
          <p v-else-if="!publicQuote.quote">已监控，暂无有效缓存行情。</p>
          <template v-else>
            <p>来源 新浪 ETF · 实际采集 {{ formatShanghaiDateTime(publicQuote.quote.collectedAt) }} · 有效交易日 {{ publicQuote.effectiveTradeDate || "—" }} · {{ dataStatusLabels[publicQuote.quote.status] }}{{ publicQuote.closeConfirmed ? "" : " · 收盘未确认" }}</p>
            <dl><div><dt>最新价 / 涨跌额</dt><dd>{{ formatPlainNumber(publicQuote.quote.price) }} / {{ formatPlainNumber(publicQuote.quote.change) }}</dd></div><div><dt>涨跌幅</dt><dd>{{ formatPercent(publicQuote.quote.changePercent) }}</dd></div><div><dt>成交额 / 成交量</dt><dd>{{ formatAmount(publicQuote.quote.amount) }} / {{ formatPlainNumber(publicQuote.quote.volume) }}</dd></div></dl>
          </template>
          <h3>资产配置</h3>
          <template v-if="detail.assetAllocation"><p>来源 雪球基金 · 请求报告期 {{ detail.assetAllocation.requestedReportPeriod }} · 采集 {{ formatShanghaiDateTime(detail.assetAllocation.collectedAt) }}</p><el-table :data="detail.assetAllocation.categories" stripe><el-table-column prop="category" label="资产类别" /><el-table-column label="占比"><template #default="{ row }">{{ row.percent }}%</template></el-table-column></el-table></template>
          <p v-else>暂无已获取的资产配置报告。</p>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.etf-detail { display: grid; gap: 12px; font-size: 13px; }
.etf-detail h2 { margin: 0; font-size: 20px; }
.etf-detail h2 small { color: var(--color-text-secondary); font-size: 13px; font-weight: 400; }
.etf-detail a { width: fit-content; color: var(--color-primary); text-decoration: underline; text-underline-offset: 3px; }
.etf-detail h3 { margin: 5px 0 0; font-size: 15px; }
.etf-detail dl { display: grid; gap: 8px; margin: 0; }
.etf-detail dl div { display: grid; grid-template-columns: minmax(120px, 35%) 1fr; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border); }
.etf-detail dt { color: var(--color-text-secondary); }
.etf-detail dd { margin: 0; overflow-wrap: anywhere; }
.etf-detail p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
</style>
