<script setup lang="ts">
import { Plus, Search, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, type TableInstance } from "element-plus";
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import * as api from "@/api/menu";
import { menuComponentPaths } from "@/router/dynamic";
import { menuIcons } from "@/layout/components/menuIcons";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import type { MenuManagementNode, MenuNodeType, MenuQuery, MenuRequest, PermissionRequest } from "@/types/menu";
import { canAccess } from "@/utils/permission";
import { filterMenuTree, flattenMenus, isBuiltinNode, isProtectedMenu, nodeLabel, validParents, validateMenuForm } from "@/utils/menu";

const router = useRouter();
const auth = useAuthStore();
const permission = usePermissionStore();
const can = (action: string) => canAccess(auth.permissionCodes, `system:menu:${action}`);
const table = ref<TableInstance>();
const tree = ref<MenuManagementNode[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const formError = ref("");
const visible = ref(false);
const editing = ref<MenuManagementNode>();
const type = ref<MenuNodeType>("DIRECTORY");
const query = reactive<MenuQuery>({ menuName: "" });
const appliedQuery = ref<MenuQuery>({});
const rows = computed(() => filterMenuTree(tree.value, appliedQuery.value));
const expanded = ref<string[]>([]);
const originalNode = (node: MenuManagementNode) => flattenMenus(tree.value).find((item) => item.nodeKey === node.nodeKey) ?? node;
const hasChildren = (node: MenuManagementNode) => !!originalNode(node).children?.length;
const labels = { DIRECTORY: "目录", MENU: "菜单", BUTTON: "按钮" };
const emptyMenu = (): MenuRequest => ({ parentId: null, menuName: "", menuType: "CONTENTS", routeName: "", routeLink: "", componentPath: "Layout", icon: "menu", sortNo: 10, visible: 1, isCache: 0, alwaysShow: 0, isExternal: 0, status: 1, remark: "" });
const menu = reactive(emptyMenu());
const action = reactive<PermissionRequest>({ permissionName: "", permissionCode: "", permissionType: "MENU_ACTION", menuId: "", apiMethod: "", apiPath: "", authTag: "", sortNo: 10, status: 1, remark: "" });
const parents = computed(() => validParents(tree.value, type.value, editing.value));
const builtinPermission = computed(() => editing.value?.nodeType === "BUTTON" && editing.value.isSystem === 1);
const locked = computed(() => !!editing.value && isProtectedMenu(editing.value));
async function load(): Promise<void> {
  if (loading.value) return;
  loading.value = true; error.value = "";
  try {
    // Keep the full tree for parent validation and no-cascade deletion; filter locally with ancestors.
    tree.value = await api.getManagementTree();
    if (!expanded.value.length) expanded.value = tree.value.map((node) => node.nodeKey);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "菜单数据加载失败，请稍后重试"; }
  finally { loading.value = false; }
}
function search(): void { appliedQuery.value = { ...query }; expanded.value = flattenMenus(rows.value).filter((node) => node.children?.length).map((node) => node.nodeKey); }
function reset(): void { Object.assign(query, { menuName: "", nodeType: undefined, status: undefined }); appliedQuery.value = {}; expanded.value = tree.value.map((node) => node.nodeKey); }
async function expandAll(value: boolean): Promise<void> {
  expanded.value = value ? flattenMenus(rows.value).map((node) => node.nodeKey) : [];
  await nextTick(); flattenMenus(rows.value).forEach((node) => table.value?.toggleRowExpansion(node, value));
}
async function open(nodeType: MenuNodeType, row?: MenuManagementNode, parent?: MenuManagementNode): Promise<void> {
  if (busy.value || !can(row ? "update" : "add")) return;
  busy.value = true; formError.value = "";
  try {
    type.value = nodeType; editing.value = row ? originalNode(row) : undefined; Object.assign(menu, emptyMenu());
    Object.assign(action, { permissionName: "", permissionCode: "", permissionType: "MENU_ACTION", menuId: "", apiMethod: "", apiPath: "", authTag: "", sortNo: 10, status: 1, remark: "" });
    if (row) {
      if (nodeType === "BUTTON") Object.assign(action, Object.fromEntries(Object.keys(action).map((key) => [key, row[key as keyof MenuManagementNode] ?? ""])), { permissionName: row.permissionName || row.menuName });
      else {
        const detail = await api.getMenuDetail(row.id);
        for (const key of Object.keys(menu) as Array<keyof MenuRequest>) {
          const value = detail[key];
          if (value != null) Object.assign(menu, { [key]: value });
        }
        menu.parentId = detail.parentId ?? null;
        menu.isExternal = detail.menuType === "LINK" ? 1 : detail.isExternal ?? 0;
      }
    } else {
      menu.menuType = nodeType === "DIRECTORY" ? "CONTENTS" : "MENU";
      menu.componentPath = nodeType === "DIRECTORY" ? "Layout" : "";
      menu.parentId = parent?.id ?? null; action.menuId = parent?.id ?? "";
      const sort = Math.min(999, Math.max(0, ...(parent?.children ?? tree.value).map((node) => node.sortNo)) + 10);
      menu.sortNo = sort; action.sortNo = sort;
    }
    visible.value = true;
  } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "详情加载失败"); }
  finally { busy.value = false; }
}
async function refreshNavigation(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try { await permission.refresh(router, true); ElMessage.success("导航权限已刷新"); }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "权限刷新失败"); }
  finally { busy.value = false; }
}
async function afterMutation(): Promise<void> {
  try { await permission.refresh(router, true); } catch { ElMessage.warning("已保存，但导航权限刷新失败，请重试刷新权限"); }
  if (router.currentRoute.value.name === "SysMenu" || router.currentRoute.value.path.includes("sysMenu")) await load();
}
async function save(): Promise<void> {
  if (busy.value || !can(editing.value ? "update" : "add")) return;
  formError.value = validateMenuForm(menu, action, type.value, tree.value, menuComponentPaths, editing.value);
  if (formError.value) return;
  busy.value = true;
  try {
    if (editing.value?.nodeType === "BUTTON" && !builtinPermission.value && (editing.value.permissionCode !== action.permissionCode || editing.value.authTag !== action.authTag)) {
      await ElMessageBox.confirm("修改权限编码或鉴权标识可能影响现有角色权限及页面操作，确定保存吗？", "修改权限标识", { type: "warning" });
    }
    if (editing.value?.status === 1 && (type.value === "BUTTON" ? action.status : menu.status) === 0) {
      await ElMessageBox.confirm("停用后相关角色将失去此入口或操作权限，确定继续吗？", "停用节点", { type: "warning" });
    }
    if (type.value === "BUTTON") {
      const payload = { ...action, permissionName: action.permissionName.trim(), permissionCode: action.permissionCode.trim(), authTag: action.authTag.trim() };
      if (editing.value) await api.updateMenuAction({ ...payload, id: editing.value.id }); else await api.createMenuAction(payload);
    } else {
      const payload = { ...menu, menuName: menu.menuName.trim(), menuType: type.value === "DIRECTORY" ? "CONTENTS" as const : menu.isExternal ? "LINK" as const : "MENU" as const, componentPath: type.value === "DIRECTORY" ? "Layout" : menu.isExternal ? "" : menu.componentPath, isCache: menu.isExternal ? 0 : menu.isCache };
      if (editing.value) await api.updateMenu({ ...payload, id: editing.value.id }); else await api.createMenu(payload);
    }
    const parentId = type.value === "BUTTON" ? action.menuId : menu.parentId;
    const parent = flattenMenus(tree.value).find((node) => node.nodeType !== "BUTTON" && String(node.id) === String(parentId));
    if (parent) expanded.value = [...new Set([...expanded.value, parent.nodeKey])];
    visible.value = false; ElMessage.success("已保存"); await afterMutation();
  } catch (cause) { if (cause !== "cancel" && cause !== "close") formError.value = cause instanceof Error ? cause.message : "保存失败"; }
  finally { busy.value = false; }
}
async function remove(row: MenuManagementNode): Promise<void> {
  if (busy.value || !can("delete") || isBuiltinNode(row as MenuManagementNode)) return;
  if (hasChildren(row)) { ElMessage.warning("当前菜单下存在子菜单或按钮，请先处理下级节点"); return; }
  busy.value = true;
  try {
    await ElMessageBox.confirm(`确定删除“${nodeLabel(row as MenuManagementNode)}”？如已被角色授权，相关角色将同步失去此权限。`, "删除节点", { type: "warning" });
    if (row.nodeType === "BUTTON") await api.deleteMenuAction(row.id); else await api.deleteMenu(row.id);
    ElMessage.success("已删除"); await afterMutation();
  } catch (cause) { if (cause !== "cancel" && cause !== "close") ElMessage.error(cause instanceof Error ? cause.message : "删除失败"); }
  finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <section class="management-page" aria-labelledby="menu-title">
    <header class="page-heading"><div><h1 id="menu-title" class="page-title">菜单管理</h1><p class="page-description">维护目录、页面与操作权限；分类和导航来自菜单树。</p></div><div class="menu-actions"><el-button v-if="can('add')" :icon="Plus" :disabled="busy" @click="open('DIRECTORY')">新增目录</el-button><el-button v-if="can('add')" type="primary" :icon="Plus" :disabled="busy" @click="open('MENU')">新增菜单</el-button></div></header>
    <div class="page-panel search-panel">
      <el-form inline label-position="top" @submit.prevent="search">
        <el-form-item label="菜单名称"><el-input v-model.trim="query.menuName" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="query.nodeType" clearable placeholder="全部"><el-option v-for="(label, value) in labels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="query.status" clearable placeholder="全部"><el-option label="启用" :value="1" /><el-option label="停用" :value="0" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <div class="page-panel table-panel">
      <div class="table-toolbar"><strong>菜单树</strong><div><el-button @click="expandAll(true)">全部展开</el-button><el-button @click="expandAll(false)">全部收起</el-button><el-button :loading="loading" @click="load">刷新</el-button><el-button :disabled="busy" @click="refreshNavigation">刷新导航权限</el-button></div></div>
      <el-alert v-if="error" :title="`菜单数据加载失败：${error}`" type="error" :closable="false" show-icon />
      <el-table ref="table" v-loading="loading" :data="rows" row-key="nodeKey" :expand-row-keys="expanded" :tree-props="{ children: 'children' }" :empty-text="error ? '加载失败，请重试' : '暂无菜单，请创建一级目录或调整查询条件'">
        <el-table-column label="菜单名称" min-width="240" fixed="left"><template #default="{ row }">{{ nodeLabel(row as MenuManagementNode) }} <el-tag v-if="isBuiltinNode(row as MenuManagementNode)" size="small">内置</el-tag></template></el-table-column>
        <el-table-column label="类型" width="90"><template #default="{ row }">{{ labels[row.nodeType as MenuNodeType] }}</template></el-table-column>
        <el-table-column label="路由 / 标识" min-width="180"><template #default="{ row }">{{ row.nodeType === 'BUTTON' ? '—' : row.routeLink || '—' }}</template></el-table-column>
        <el-table-column label="关联权限" min-width="190"><template #default="{ row }">{{ row.nodeType === 'BUTTON' ? row.permissionCode : (row.children || []).filter((node: MenuManagementNode) => node.nodeType === 'BUTTON').map((node: MenuManagementNode) => node.permissionCode).filter(Boolean).join('、') || '—' }}</template></el-table-column>
        <el-table-column prop="sortNo" label="排序" width="70" />
        <el-table-column label="显示" width="80"><template #default="{ row }">{{ row.nodeType === 'BUTTON' ? '—' : row.visible === 1 ? '显示' : '隐藏' }}</template></el-table-column>
        <el-table-column label="状态" width="85"><template #default="{ row }"><el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="can('add') && row.nodeType !== 'BUTTON'" link type="primary" :disabled="busy" @click="open(row.nodeType === 'MENU' ? 'BUTTON' : 'MENU', undefined, row as MenuManagementNode)">{{ row.nodeType === 'MENU' ? '新增按钮' : '新增菜单' }}</el-button>
            <el-button v-if="can('add') && row.nodeType === 'DIRECTORY'" link :disabled="busy" @click="open('DIRECTORY', undefined, row as MenuManagementNode)">新增目录</el-button>
            <el-button v-if="can('update')" link type="primary" :disabled="busy" @click="open(row.nodeType, row as MenuManagementNode)">编辑</el-button>
            <el-button v-if="can('delete')" link type="danger" :disabled="busy || isBuiltinNode(row as MenuManagementNode) || hasChildren(row as MenuManagementNode)" @click="remove(row as MenuManagementNode)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-drawer v-model="visible" :title="`${editing ? '编辑' : '新增'}${labels[type]}`" size="min(600px, 94vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" destroy-on-close>
      <el-alert v-if="builtinPermission" title="内置权限的编码和鉴权标识不可修改。" type="info" :closable="false" />
      <el-alert v-if="locked" title="内置节点保留关键配置；允许修改名称、排序和备注。" type="info" :closable="false" />
      <el-alert v-if="formError" :title="formError" type="error" :closable="false" role="alert" />
      <el-form label-position="top" :disabled="busy" @submit.prevent="save">
        <el-form-item label="节点类型"><el-radio-group v-model="type" :disabled="!!editing || type === 'BUTTON'"><el-radio-button v-if="type !== 'BUTTON'" value="DIRECTORY">目录</el-radio-button><el-radio-button v-if="type !== 'BUTTON'" value="MENU">页面菜单</el-radio-button><el-radio-button v-else value="BUTTON">按钮</el-radio-button></el-radio-group></el-form-item>
        <template v-if="type !== 'BUTTON'">
          <el-form-item label="上级目录"><el-select v-model="menu.parentId" :disabled="locked" clearable placeholder="根节点"><el-option v-for="parent in parents" :key="parent.nodeKey" :label="nodeLabel(parent)" :value="parent.id" /></el-select></el-form-item>
          <el-form-item label="菜单名称" required><el-input v-model="menu.menuName" maxlength="50" /></el-form-item>
          <el-form-item label="路由名称" required><el-input v-model.trim="menu.routeName" :disabled="locked" /></el-form-item>
          <el-form-item :label="menu.isExternal ? '外链地址' : '路由地址'" required><el-input v-model.trim="menu.routeLink" :disabled="locked" /></el-form-item>
          <template v-if="type === 'MENU'">
            <el-form-item label="外链"><el-switch v-model="menu.isExternal" :active-value="1" :inactive-value="0" :disabled="locked" /></el-form-item>
            <el-form-item v-if="!menu.isExternal" label="页面组件" required><el-select v-model="menu.componentPath" filterable :disabled="locked"><el-option v-for="path in menuComponentPaths" :key="path" :value="path" :label="path" /></el-select><p v-if="menu.componentPath && !menuComponentPaths.includes(menu.componentPath)" class="field-help">当前组件不存在，请选择真实页面组件。</p></el-form-item>
            <el-form-item v-if="!menu.isExternal" label="缓存页面"><el-switch v-model="menu.isCache" :active-value="1" :inactive-value="0" :disabled="locked" /></el-form-item>
            <p class="field-help">页面关联权限通过其按钮子节点维护。</p>
          </template>
          <el-form-item label="图标"><el-select v-model="menu.icon" clearable><el-option v-for="(component, key) in menuIcons" :key="key" :value="key" :label="String(key)"><el-icon><component :is="component" /></el-icon> {{ key }}</el-option></el-select></el-form-item>
          <el-form-item label="显示"><el-switch v-model="menu.visible" :active-value="1" :inactive-value="0" :disabled="locked" /></el-form-item>
          <el-form-item v-if="type === 'DIRECTORY'" label="始终显示目录"><el-switch v-model="menu.alwaysShow" :active-value="1" :inactive-value="0" :disabled="locked" /></el-form-item>
          <el-form-item label="排序" required><el-input-number v-model="menu.sortNo" :min="0" :max="999" /></el-form-item>
          <el-form-item label="状态"><el-radio-group v-model="menu.status" :disabled="locked"><el-radio :value="1">启用</el-radio><el-radio :value="0">停用</el-radio></el-radio-group></el-form-item>
          <el-form-item label="备注"><el-input v-model="menu.remark" type="textarea" maxlength="500" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="所属页面" required><el-select v-model="action.menuId" :disabled="locked"><el-option v-for="parent in parents" :key="parent.nodeKey" :label="nodeLabel(parent)" :value="parent.id" /></el-select></el-form-item>
          <el-form-item label="按钮名称" required><el-input v-model="action.permissionName" maxlength="50" /></el-form-item>
          <el-form-item label="权限编码" required><el-input v-model.trim="action.permissionCode" :disabled="builtinPermission" /></el-form-item>
          <el-form-item label="鉴权标识" required><el-input v-model.trim="action.authTag" :disabled="builtinPermission" /></el-form-item>
          <el-form-item label="权限类型"><el-select v-model="action.permissionType" :disabled="locked"><el-option label="页面操作" value="MENU_ACTION" /><el-option label="接口权限" value="API" /></el-select></el-form-item>
          <template v-if="action.permissionType === 'API'"><el-form-item label="接口方法"><el-select v-model="action.apiMethod" :disabled="locked"><el-option value="GET" /><el-option value="POST" /></el-select></el-form-item><el-form-item label="接口路径"><el-input v-model.trim="action.apiPath" :disabled="locked" /></el-form-item></template>
          <el-form-item label="排序"><el-input-number v-model="action.sortNo" :min="0" :max="999" /></el-form-item>
          <el-form-item label="状态"><el-radio-group v-model="action.status" :disabled="locked"><el-radio :value="1">启用</el-radio><el-radio :value="0">停用</el-radio></el-radio-group></el-form-item>
          <el-form-item label="备注"><el-input v-model="action.remark" type="textarea" maxlength="500" /></el-form-item>
        </template>
      </el-form>
      <template #footer><el-button :disabled="busy" @click="visible = false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存</el-button></template>
    </el-drawer>
  </section>
</template>
<style scoped>
.management-page { display: grid; gap: 18px; }
.page-heading, .table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.search-panel, .table-panel { padding: 18px; min-width: 0; }
.search-panel :deep(.el-form) { display: grid; grid-template-columns: repeat(3, minmax(140px, 1fr)) auto; align-items: end; gap: 12px; }
.search-panel :deep(.el-form-item) { margin: 0; }
.el-select { width: 100%; }
.menu-actions { display: flex; gap: 8px; }
.field-help { color: var(--color-text-secondary); font-size: 12px; }
@media (max-width: 767px) { .page-heading, .table-toolbar { align-items: stretch; flex-direction: column; } .search-panel :deep(.el-form) { grid-template-columns: 1fr; } }
</style>
