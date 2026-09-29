<script setup lang="ts">
import { Plus, Refresh, Search } from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { computed, nextTick, onMounted, reactive, ref } from "vue";

import { addStockDictionary, getStockDictionaryAdminPage } from "@/api/stockData";
import { useAuthStore } from "@/stores/auth";
import type { StockDictionaryCreateRequest, StockDictionaryPageQuery, StockSymbol } from "@/types/market";
import { canAccess } from "@/utils/permission";
import "@/styles/stockData.css";

const query = reactive<StockDictionaryPageQuery>({ pageNum: 1, pageSize: 10, keyword: "", market: undefined });
const rows = ref<StockSymbol[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref("");
const authStore = useAuthStore();
const canAdd = computed(() => canAccess(authStore.permissionCodes, "system:stock-dictionary:add"));
const createOpen = ref(false);
const creating = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive<StockDictionaryCreateRequest>({ market: "SH", code: "", name: "" });
const createRules: FormRules<StockDictionaryCreateRequest> = {
  market: [{ required: true, message: "请选择交易所", trigger: "change" }],
  code: [{ required: true, pattern: /^[0-9]{6}$/, message: "请输入六位股票代码", trigger: "blur" }],
  name: [{ required: true, whitespace: true, message: "请输入股票名称", trigger: "blur" },
    { max: 100, message: "股票名称最多 100 字", trigger: "blur" }],
};

async function loadPage(): Promise<void> {
  loading.value = true;
  try {
    const page = await getStockDictionaryAdminPage({ ...query, keyword: query.keyword?.trim() || undefined });
    rows.value = page.list ?? [];
    total.value = Number(page.total ?? 0);
    loadError.value = "";
  } catch (error) {
    rows.value = [];
    total.value = 0;
    loadError.value = error instanceof Error ? error.message : "股票字典加载失败";
  } finally {
    loading.value = false;
  }
}

function search(): void { query.pageNum = 1; void loadPage(); }
function reset(): void {
  Object.assign(query, { pageNum: 1, pageSize: 10, keyword: "", market: undefined });
  void loadPage();
}

function openCreate(): void {
  Object.assign(createForm, { market: "SH", code: "", name: "" });
  createOpen.value = true;
  nextTick(() => createFormRef.value?.clearValidate());
}

async function submitCreate(): Promise<void> {
  if (!canAdd.value || !createOpen.value || creating.value) return;
  creating.value = true;
  try {
    const valid = await createFormRef.value?.validate().catch(() => false);
    if (!valid) return;
    const stock = await addStockDictionary({
      market: createForm.market,
      code: createForm.code.trim(),
      name: createForm.name.trim(),
    });
    createOpen.value = false;
    Object.assign(query, { pageNum: 1, keyword: stock.code, market: stock.market });
    await loadPage();
    ElMessage.success("股票已加入字典，监控需在配置页另行启用");
  } catch {
    // 请求拦截器已显示失败原因；保留表单以便修正后重试。
  } finally {
    creating.value = false;
  }
}

onMounted(loadPage);
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="stock-dictionary-title">
    <header class="stock-page-heading">
      <div>
        <h1 id="stock-dictionary-title" class="page-title">交易所股票字典</h1>
        <p class="page-description">沪深北交易所股票代码与名称清单；可手工补录，不包含雪球报价。</p>
      </div>
      <div class="stock-page-actions">
        <el-button v-if="canAdd" type="primary" :icon="Plus" @click="openCreate">新增股票</el-button>
      </div>
    </header>
    <div class="page-panel stock-filter-panel">
      <el-form class="stock-filter-form" :model="query" inline label-position="top" @submit.prevent="search">
        <el-form-item label="股票代码或名称"><el-input v-model.trim="query.keyword" clearable placeholder="输入代码或名称" @keyup.enter="search" /></el-form-item>
        <el-form-item label="市场"><el-select v-model="query.market" clearable placeholder="全部市场"><el-option label="上海" value="SH" /><el-option label="深圳" value="SZ" /><el-option label="北京" value="BJ" /></el-select></el-form-item>
        <el-form-item class="stock-filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>股票字典</strong><span>共 {{ total }} 条</span></div></div>
      <p v-if="loadError" class="stock-error" role="alert">{{ loadError }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="暂无符合条件的股票">
        <el-table-column label="股票" min-width="180"><template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template></el-table-column>
        <el-table-column prop="code" label="代码" min-width="130" />
        <el-table-column prop="market" label="市场" min-width="100" />
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.pageNum" v-model:page-size="query.pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @change="loadPage"
        />
      </div>
    </div>
    <el-drawer v-model="createOpen" title="新增字典股票" size="min(440px, 92vw)" :close-on-click-modal="!creating" :close-on-press-escape="!creating" :show-close="!creating">
      <p class="stock-info">手工补录仅更新股票字典。需要监控时，请到“个股监控配置”页启用。</p>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="交易所" prop="market">
          <el-select v-model="createForm.market" placeholder="选择交易所">
            <el-option label="上海 SH" value="SH" /><el-option label="深圳 SZ" value="SZ" /><el-option label="北京 BJ" value="BJ" />
          </el-select>
        </el-form-item>
        <el-form-item label="六位股票代码" prop="code"><el-input v-model.trim="createForm.code" maxlength="6" inputmode="numeric" placeholder="例如 600000" /></el-form-item>
        <el-form-item label="股票名称" prop="name"><el-input v-model.trim="createForm.name" maxlength="100" placeholder="输入交易所公布的名称" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">确定新增</el-button>
      </template>
    </el-drawer>
  </section>
</template>
