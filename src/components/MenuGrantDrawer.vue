<script setup lang="ts">
import { ElMessage } from "element-plus";
import { ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { getMenuGrantTree, saveMenuGrants } from "@/api/menu";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import type { SysRole } from "@/types/api";
import type { MenuManagementNode } from "@/types/menu";
import { MenuGrantSelection, nodeLabel } from "@/utils/menu";
import { canAccess } from "@/utils/permission";
const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ role?: SysRole }>();
const router = useRouter(); const auth = useAuthStore(); const permission = usePermissionStore();
const loading = ref(false); const saving = ref(false); const error = ref("");
const selection = shallowRef<MenuGrantSelection>(); const revision = ref(0);
let generation = 0;
async function load(): Promise<void> {
  if (!props.role || saving.value) return;
  const current = ++generation; const roleId = props.role.id;
  loading.value = true; error.value = ""; selection.value = undefined;
  try { const data = await getMenuGrantTree(roleId); if (current === generation) selection.value = new MenuGrantSelection(data); }
  catch (cause) { if (current === generation) error.value = cause instanceof Error ? cause.message : "授权树加载失败"; }
  finally { if (current === generation) loading.value = false; }
}
function toggle(node: MenuManagementNode, value: boolean): void { selection.value?.toggle(node, value); revision.value++; }
async function save(): Promise<void> {
  if (saving.value || loading.value || !selection.value || !props.role || props.role.isSystem === 1 || !canAccess(auth.permissionCodes, "system:role:grant")) return;
  saving.value = true; error.value = "";
  try {
    await saveMenuGrants(selection.value.payload(props.role.id));
    ElMessage.success("菜单授权已保存"); visible.value = false;
    try { await permission.refresh(router, true); } catch { ElMessage.warning("授权已保存，权限刷新失败，请重试"); }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "授权保存失败"; }
  finally { saving.value = false; }
}
watch([visible, () => props.role?.id], ([open]) => { if (open) void load(); else { generation++; loading.value = false; } });
</script>
<template>
  <el-drawer v-model="visible" :title="`${role?.roleName || ''} · 菜单授权`" size="min(620px, 94vw)" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" destroy-on-close>
    <p>页面与按钮分别选择。选择目录授予其页面；按钮需单独勾选。停用和独立权限的历史关联会保留。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-button v-if="error && !selection" :loading="loading" @click="load">重新加载</el-button>
    <div v-loading="loading" :data-revision="revision">
      <el-tree v-if="selection" :data="selection.data.tree" node-key="nodeKey" :props="{ children: 'children', label: 'menuName' }" :default-expanded-keys="selection.data.tree.map(node => node.nodeKey)" :expand-on-click-node="false">
        <template #default="{ data }"><el-checkbox :model-value="selection.checked(data)" :indeterminate="selection.indeterminate(data)" :disabled="saving || role?.isSystem === 1 || !selection.enabled(data)" @change="(value: string | number | boolean) => toggle(data, !!value)">{{ nodeLabel(data) }} <small v-if="!selection.enabled(data)">（已停用）</small><small v-else-if="data.nodeType === 'BUTTON'">（操作）</small></el-checkbox></template>
      </el-tree>
      <el-empty v-if="selection && !selection.data.tree.length" description="暂无可授权菜单" />
    </div>
    <template #footer><el-button :disabled="saving" @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading || !selection || role?.isSystem === 1" @click="save">保存授权</el-button></template>
  </el-drawer>
</template>
