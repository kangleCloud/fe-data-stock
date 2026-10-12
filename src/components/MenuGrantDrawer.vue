<script setup lang="ts">
import { QuestionFilled } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { nextTick, ref, shallowRef, triggerRef, watch } from "vue";
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
const router = useRouter();
const auth = useAuthStore();
const permission = usePermissionStore();
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const selection = shallowRef<MenuGrantSelection>();
const tipsVisible = ref(false);
const tipsPinned = ref(false);
const titleRef = ref<HTMLElement>();
async function focusTitle(): Promise<void> {
  // 等待抽屉默认聚焦结束，避免说明按钮因自动获得焦点而展开。
  await nextTick();
  await nextTick();
  titleRef.value?.focus({ preventScroll: true });
  hideTips();
}
const typeLabels = { DIRECTORY: "目录", MENU: "页面", BUTTON: "操作" };
let generation = 0;

function hideTips(): void { tipsPinned.value = false; tipsVisible.value = false; }
function closeTransientTips(): void { if (!tipsPinned.value) tipsVisible.value = false; }
function pinTips(): void {
  tipsPinned.value = !tipsPinned.value;
  tipsVisible.value = tipsPinned.value;
}
async function load(): Promise<void> {
  if (!props.role || saving.value) return;
  const current = ++generation;
  const roleId = props.role.id;
  loading.value = true;
  error.value = "";
  selection.value = undefined;
  try {
    const data = await getMenuGrantTree(roleId);
    if (current === generation) selection.value = new MenuGrantSelection(data);
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : "授权树加载失败";
  } finally {
    if (current === generation) loading.value = false;
  }
}
function toggle(node: MenuManagementNode, value: boolean): void {
  if (saving.value || props.role?.isSystem === 1) return;
  selection.value?.toggle(node, value);
  // Map 本身不响应更新，显式通知授权树的稳定插槽刷新勾选状态。
  triggerRef(selection);
}
async function save(): Promise<void> {
  if (saving.value || loading.value || !selection.value || !props.role || props.role.isSystem === 1 || !canAccess(auth.permissionCodes, "system:role:grant")) return;
  saving.value = true;
  error.value = "";
  try {
    await saveMenuGrants(selection.value.payload(props.role.id));
    ElMessage.success("菜单授权已保存");
    visible.value = false;
    try { await permission.refresh(router, true); }
    catch { ElMessage.warning("授权已保存，权限刷新失败，请重试"); }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "授权保存失败";
  } finally {
    saving.value = false;
  }
}
watch([visible, () => props.role?.id], ([open]) => {
  hideTips();
  if (open) void load();
  else { generation++; loading.value = false; }
});
</script>

<template>
  <el-drawer
    v-model="visible"
    size="min(620px, 94vw)"
    body-class="grant-drawer-body"
    footer-class="grant-drawer-footer"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    destroy-on-close
    @open-auto-focus="focusTitle"
  >
    <template #header="{ titleId, titleClass }">
      <div class="grant-heading">
        <h2 ref="titleRef" tabindex="-1" :id="titleId" :class="[titleClass, 'grant-title']">{{ role?.roleName || '角色' }} · 菜单授权</h2>
        <el-popover :visible="tipsVisible" :trigger="[]" :width="280" placement="bottom-end">
          <template #reference>
            <button
              class="grant-tips-button"
              type="button"
              @mouseenter="tipsVisible = true"
              @mouseleave="closeTransientTips"
              @focus="tipsVisible = true"
              @blur="closeTransientTips"
              @click="pinTips"
              @keydown.esc.stop="hideTips"
            >
              <el-icon><QuestionFilled /></el-icon>授权说明
            </button>
          </template>
          <div class="grant-tips-content">
            <strong>授权说明</strong>
            <ul>
              <li>页面与按钮分别授权；选择按钮会补齐页面和目录祖先。</li>
              <li>选择目录授予其页面，按钮需单独勾选；取消页面会取消其有效按钮。</li>
              <li>停用节点及独立权限的历史关联会保留。</li>
            </ul>
          </div>
        </el-popover>
      </div>
    </template>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-button v-if="error && !selection" class="grant-retry" :loading="loading" @click="load">重新加载</el-button>
    <p v-if="loading" class="grant-loading" role="status">正在加载授权…</p>
    <div class="grant-tree-scroll">
      <el-tree
        v-if="selection"
        class="grant-tree"
        :data="selection.data.tree"
        node-key="nodeKey"
        :indent="20"
        :props="{ children: 'children', label: 'menuName' }"
        :default-expanded-keys="selection.data.tree.map(node => node.nodeKey)"
        :expand-on-click-node="false"
      >
        <template #default="{ data }">
          <div class="grant-row" :class="{ 'is-disabled': !selection.enabled(data), 'is-directory': data.nodeType === 'DIRECTORY' }" :data-node-key="data.nodeKey">
            <el-checkbox
              :model-value="selection.checked(data)"
              :indeterminate="selection.indeterminate(data)"
              :disabled="saving || role?.isSystem === 1 || !selection.enabled(data)"
              @change="(value: string | number | boolean) => toggle(data, !!value)"
            >
              <span class="grant-node-name" :title="nodeLabel(data)">{{ nodeLabel(data) }}</span>
              <span class="grant-node-type">{{ typeLabels[data.nodeType as keyof typeof typeLabels] }}</span>
              <span v-if="!selection.enabled(data)" class="grant-node-status">已停用</span>
            </el-checkbox>
          </div>
        </template>
      </el-tree>
      <el-empty v-if="selection && !selection.data.tree.length" description="暂无可授权菜单" />
    </div>
    <template #footer>
      <div class="grant-footer-actions">
        <el-button :disabled="saving" @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="loading || !selection || role?.isSystem === 1" @click="save">保存授权</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
:global(.grant-drawer-body) { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: hidden; padding: 16px 20px; }
:global(.grant-drawer-footer) { border-top: 1px solid var(--color-border); padding: 16px 20px; background: var(--color-surface); }
.grant-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; min-width: 0; }
.grant-title { margin: 0; color: var(--color-text); font-size: 18px; line-height: 1.5; overflow-wrap: anywhere; }
.grant-tips-button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 6px; border: 0; border-radius: 6px; color: var(--color-primary); background: transparent; font: inherit; font-size: 13px; cursor: pointer; }
.grant-tips-button:hover { background: var(--color-primary-soft); }
.grant-tips-button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.grant-tips-content { color: var(--color-text); font-size: 13px; line-height: 1.6; }
.grant-tips-content ul { margin: 8px 0 0; padding-left: 18px; }
.grant-tips-content li + li { margin-top: 6px; }
.grant-loading { margin: 0; color: var(--color-text-secondary); font-size: 13px; }
.grant-retry { align-self: flex-start; }
.grant-tree-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.grant-tree { min-width: 0; background: transparent; }
.grant-tree :deep(.el-tree-node__content) { min-height: 40px; height: auto; padding-right: 8px; border-radius: 6px; }
.grant-tree :deep(.el-tree-node__expand-icon) { padding: 8px; }
.grant-row { display: flex; flex: 1; min-width: 0; }
.grant-row :deep(.el-checkbox) { display: flex; flex: 1; min-width: 0; height: auto; min-height: 40px; margin-right: 0; }
.grant-row :deep(.el-checkbox__label) { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; }
.grant-node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-directory .grant-node-name { font-weight: 600; }
.grant-node-type, .grant-node-status { flex-shrink: 0; color: var(--color-text-secondary); font-size: 12px; }
.grant-node-type { padding: 2px 6px; border-radius: 4px; background: var(--color-surface-subtle); }
.is-disabled :deep(.el-checkbox__label) { color: var(--color-text-secondary); }
.grant-footer-actions { display: flex; justify-content: flex-end; gap: 8px; }
.grant-footer-actions :deep(.el-button + .el-button) { margin-left: 0; }
@media (max-width: 767px) {
  :global(.grant-drawer-body), :global(.grant-drawer-footer) { padding: 12px; }
  .grant-title { font-size: 16px; }
  .grant-tips-button, .grant-row :deep(.el-checkbox), .grant-tree :deep(.el-tree-node__content) { min-height: 44px; }
  .grant-node-type { padding: 2px 4px; }
  .grant-row :deep(.el-checkbox__label) { gap: 6px; }
}
</style>
