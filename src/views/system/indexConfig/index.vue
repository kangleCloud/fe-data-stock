<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";

import { getIndexConfig, updateIndexConfig } from "@/api/etf";
import { useAuthStore } from "@/stores/auth";
import type { IndexConfig } from "@/types/etf";
import { canAccess } from "@/utils/permission";
import "@/styles/stockData.css";

const auth = useAuthStore();
const canUpdate = computed(() => canAccess(auth.permissionCodes, "system:index-config:update"));
const rows = ref<IndexConfig[]>([]);
const draftOrder = ref<Record<string, number>>({});
const loading = ref(false);
const error = ref("");
const submitting = ref("");

async function load(): Promise<void> {
  loading.value = true;
  try { rows.value = (await getIndexConfig()).sort((a, b) => a.sortOrder - b.sortOrder);
    draftOrder.value = Object.fromEntries(rows.value.map((item) => [item.code, item.sortOrder])); error.value = ""; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "指数配置读取失败"; }
  finally { loading.value = false; }
}

async function update(row: IndexConfig, enabled: boolean, sortOrder: number): Promise<void> {
  if (!canUpdate.value || submitting.value) return;
  try { await ElMessageBox.confirm(`将 ${row.name} 设为${enabled ? "启用" : "停用"}、顺序 ${sortOrder}？`, "修改指数配置", {
    confirmButtonText: "确认", cancelButtonText: "取消", type: "warning",
  }); } catch { return; }
  submitting.value = row.code;
  try { await updateIndexConfig(row.code, enabled, sortOrder); await load(); ElMessage.success("指数配置已更新"); }
  catch { /* 请求层已提示错误，保留当前配置和输入。 */ }
  finally { submitting.value = ""; }
}

onMounted(load);
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="index-config-title">
    <header class="stock-page-heading"><div><h1 id="index-config-title" class="page-title">核心指数配置</h1><p class="page-description">五个已核实指数由新浪行情采集，公开大屏按已启用清单展示。</p></div><div class="stock-page-actions"><el-button :icon="Refresh" :loading="loading" @click="load">重新读取</el-button></div></header>
    <p class="stock-info">启停和排序会触发公开市场快照重同步；未启用指数不展示。行情未提供可靠源时间，页面标注采集时间。</p>
    <div class="page-panel stock-table-panel">
      <p v-if="error" class="stock-error" role="alert">{{ error }}</p>
      <el-table v-loading="loading" :data="rows" row-key="code" stripe empty-text="暂无指数配置">
        <el-table-column prop="name" label="指数" min-width="150" /><el-table-column prop="code" label="核实代码" min-width="130" />
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? "已启用" : "已停用" }}</el-tag></template></el-table-column>
        <el-table-column label="展示顺序" min-width="180"><template #default="{ row }"><el-input-number v-if="canUpdate" v-model="draftOrder[row.code]" :min="1" :max="5" :step="1" controls-position="right" aria-label="展示顺序" /><span v-else>{{ row.sortOrder }}</span></template></el-table-column>
        <el-table-column v-if="canUpdate" label="操作" min-width="180"><template #default="{ row }"><el-button link type="primary" :disabled="Boolean(submitting) || draftOrder[row.code] === row.sortOrder" :loading="submitting === row.code" @click="update(row as IndexConfig, row.enabled, draftOrder[row.code] ?? row.sortOrder)">保存顺序</el-button><el-button link :type="row.enabled ? 'danger' : 'primary'" :disabled="Boolean(submitting)" @click="update(row as IndexConfig, !row.enabled, row.sortOrder)">{{ row.enabled ? "停用" : "启用" }}</el-button></template></el-table-column>
      </el-table>
    </div>
  </section>
</template>
