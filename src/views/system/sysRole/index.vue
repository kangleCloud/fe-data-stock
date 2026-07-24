<script setup lang="ts">
import {
  Delete,
  EditPen,
  Plus,
  Refresh,
  Search,
} from "@element-plus/icons-vue";
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from "element-plus";
import { nextTick, onMounted, reactive, ref } from "vue";

import {
  checkRoleCodeUnique,
  checkRoleNameUnique,
  createRole,
  deleteRole,
  getRoleDetail,
  getRolePage,
  updateRole,
} from "@/api/role";
import type {
  DataScope,
  EntityId,
  RoleCreateRequest,
  RoleSearchQuery,
  RoleUpdateRequest,
  SysRole,
} from "@/types/api";
import { pageAfterSingleRowDelete } from "@/utils/pagination";

interface RoleFormModel {
  id?: EntityId;
  roleName: string;
  roleCode: string;
  roleSort: number;
  status: number;
  dataScopeType: DataScope;
  remark: string;
}

const dataScopeOptions: Array<{ label: string; value: DataScope }> = [
  { label: "全部数据", value: "ALL" },
  { label: "本部门及子部门", value: "DEPT_AND_CHILD" },
  { label: "仅本部门", value: "DEPT_SELF" },
  { label: "仅本人", value: "SELF" },
  { label: "自定义", value: "CUSTOM" },
];

const loading = ref(false);
const submitting = ref(false);
const drawerVisible = ref(false);
const editing = ref(false);
const total = ref(0);
const rows = ref<SysRole[]>([]);
const formRef = ref<FormInstance>();

const query = reactive<RoleSearchQuery>({
  pageNum: 1,
  pageSize: 10,
  roleName: "",
  roleCode: "",
  status: undefined,
});

const createEmptyForm = (): RoleFormModel => ({
  id: undefined,
  roleName: "",
  roleCode: "",
  roleSort: 1,
  status: 1,
  dataScopeType: "SELF",
  remark: "",
});

const form = reactive<RoleFormModel>(createEmptyForm());

const rules: FormRules<RoleFormModel> = {
  roleName: [
    { required: true, message: "请输入角色名称", trigger: "blur" },
    { max: 64, message: "角色名称最多 64 位", trigger: "blur" },
    {
      asyncValidator: async (_rule, value: string) => {
        if (value && !(await checkRoleNameUnique(value.trim(), form.id))) {
          throw new Error("角色名称已存在");
        }
      },
      trigger: "blur",
    },
  ],
  roleCode: [
    { required: true, message: "请输入角色编码", trigger: "blur" },
    {
      pattern: /^[A-Z][A-Z0-9_]{1,63}$/,
      message: "使用大写字母、数字和下划线，且以字母开头",
      trigger: "blur",
    },
    {
      asyncValidator: async (_rule, value: string) => {
        if (value && !(await checkRoleCodeUnique(value.trim(), form.id))) {
          throw new Error("角色编码已存在或为保留编码");
        }
      },
      trigger: "blur",
    },
  ],
  roleSort: [
    { required: true, message: "请输入显示顺序", trigger: "change" },
  ],
  status: [{ required: true, message: "请选择状态", trigger: "change" }],
  dataScopeType: [
    { required: true, message: "请选择数据范围", trigger: "change" },
  ],
};

function dataScopeLabel(value: DataScope): string {
  return dataScopeOptions.find((item) => item.value === value)?.label ?? value;
}

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    const result = await getRolePage(query);
    rows.value = result.list ?? [];
    total.value = Number(result.total ?? 0);
  } finally {
    loading.value = false;
  }
}

function handleSearch(): void {
  query.pageNum = 1;
  void loadData();
}

function resetSearch(): void {
  Object.assign(query, {
    pageNum: 1,
    pageSize: 10,
    roleName: "",
    roleCode: "",
    status: undefined,
  });
  void loadData();
}

function resetForm(): void {
  Object.assign(form, createEmptyForm());
  nextTick(() => formRef.value?.clearValidate());
}

function openCreate(): void {
  editing.value = false;
  resetForm();
  drawerVisible.value = true;
}

async function openEdit(row: SysRole): Promise<void> {
  if (row.isSystem === 1) {
    return;
  }
  editing.value = true;
  resetForm();
  const detail = await getRoleDetail(row.id);
  Object.assign(form, {
    id: detail.id,
    roleName: detail.roleName,
    roleCode: detail.roleCode,
    roleSort: detail.roleSort,
    status: detail.status,
    dataScopeType: detail.dataScopeType,
    remark: detail.remark ?? "",
  });
  drawerVisible.value = true;
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  submitting.value = true;
  try {
    const payload: RoleCreateRequest = {
      roleName: form.roleName.trim(),
      roleCode: form.roleCode.trim().toUpperCase(),
      roleSort: form.roleSort,
      status: form.status,
      dataScopeType: form.dataScopeType,
      remark: form.remark.trim(),
    };
    if (editing.value && form.id != null) {
      await updateRole({ ...payload, id: form.id } as RoleUpdateRequest);
      ElMessage.success("角色信息已更新");
    } else {
      await createRole(payload);
      ElMessage.success("角色创建成功");
    }
    drawerVisible.value = false;
    await loadData();
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: SysRole): Promise<void> {
  await ElMessageBox.confirm(
    `确定删除角色“${row.roleName}”吗？关联关系将同步清理。`,
    "删除角色",
    {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    },
  );
  await deleteRole(row.id);
  query.pageNum = pageAfterSingleRowDelete(query.pageNum, rows.value.length);
  ElMessage.success("角色已删除");
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <section class="management-page" aria-labelledby="role-page-title">
    <header class="page-heading">
      <div>
        <h1 id="role-page-title" class="page-title">角色管理</h1>
        <p class="page-description">
          维护角色标识、状态和数据访问范围。
        </p>
      </div>
      <el-button
        v-permission="'system:role:add'"
        type="primary"
        :icon="Plus"
        @click="openCreate"
      >
        新增角色
      </el-button>
    </header>

    <div class="page-panel search-panel">
      <el-form :model="query" inline label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="角色名称">
          <el-input
            v-model.trim="query.roleName"
            clearable
            placeholder="输入角色名称"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input
            v-model.trim="query.roleCode"
            clearable
            placeholder="输入角色编码"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部状态">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item class="search-actions">
          <el-button type="primary" :icon="Search" @click="handleSearch">
            查询
          </el-button>
          <el-button :icon="Refresh" @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="page-panel table-panel">
      <div class="table-toolbar">
        <div>
          <strong>角色列表</strong>
          <span>共 {{ total }} 个角色</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        stripe
        empty-text="暂无符合条件的角色"
      >
        <el-table-column prop="roleName" label="角色名称" min-width="150" fixed="left">
          <template #default="{ row }">
            <div class="role-name">
              <strong>{{ row.roleName }}</strong>
              <el-tag v-if="row.isSystem === 1" size="small" effect="plain">
                系统内置
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="roleCode" label="角色编码" min-width="170">
          <template #default="{ row }">
            <code>{{ row.roleCode }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="roleSort" label="排序" width="80" />
        <el-table-column label="数据范围" min-width="150">
          <template #default="{ row }">
            {{ dataScopeLabel(row.dataScopeType) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="light">
              {{ row.status === 1 ? "启用" : "禁用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180">
          <template #default="{ row }">{{ row.remark || "—" }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-tooltip
              :disabled="row.isSystem !== 1"
              content="系统内置角色不可编辑"
            >
              <span>
                <el-button
                  v-permission="'system:role:update'"
                  link
                  type="primary"
                  :icon="EditPen"
                  :disabled="row.isSystem === 1"
                  @click="openEdit(row as SysRole)"
                >
                  编辑
                </el-button>
              </span>
            </el-tooltip>
            <el-tooltip
              :disabled="row.isSystem !== 1"
              content="系统内置角色不可删除"
            >
              <span>
                <el-button
                  v-permission="'system:role:delete'"
                  link
                  type="danger"
                  :icon="Delete"
                  :disabled="row.isSystem === 1"
                  @click="handleDelete(row as SysRole)"
                >
                  删除
                </el-button>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.pageNum"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @change="loadData"
        />
      </div>
    </div>

    <el-drawer
      v-model="drawerVisible"
      :title="editing ? '编辑角色' : '新增角色'"
      size="min(540px, 92vw)"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        status-icon
      >
        <div class="form-grid">
          <el-form-item label="角色名称" prop="roleName">
            <el-input
              v-model.trim="form.roleName"
              maxlength="64"
              placeholder="例如：数据管理员"
            />
          </el-form-item>
          <el-form-item label="角色编码" prop="roleCode">
            <el-input
              v-model.trim="form.roleCode"
              maxlength="64"
              placeholder="例如：DATA_ADMIN"
              @input="form.roleCode = String(form.roleCode).toUpperCase()"
            />
          </el-form-item>
          <el-form-item label="显示顺序" prop="roleSort">
            <el-input-number
              v-model="form.roleSort"
              :min="0"
              :max="9999"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="角色状态" prop="status">
            <el-radio-group v-model="form.status">
              <el-radio-button :value="1">启用</el-radio-button>
              <el-radio-button :value="0">禁用</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>
        <el-form-item label="数据范围" prop="dataScopeType">
          <el-select v-model="form.dataScopeType" class="full-width">
            <el-option
              v-for="item in dataScopeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <div class="field-help">
            本期保存数据范围标识，自定义部门选择将在授权模块中实现。
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="说明该角色的职责和使用范围"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ submitting ? "正在保存…" : "保存" }}
        </el-button>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.management-page {
  display: grid;
  gap: 18px;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.search-panel,
.table-panel {
  padding: 18px;
}

.search-panel :deep(.el-form) {
  display: grid;
  grid-template-columns: repeat(3, minmax(170px, 1fr)) auto;
  align-items: end;
  gap: 12px;
}

.search-panel :deep(.el-form-item) {
  width: 100%;
  margin: 0;
}

.search-actions :deep(.el-form-item__content) {
  flex-wrap: nowrap;
}

.table-toolbar strong {
  font-size: 15px;
}

.table-toolbar span {
  margin-left: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.role-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

code {
  padding: 3px 7px;
  color: #1e40af;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  border-radius: 6px;
  background: #eff6ff;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.full-width {
  width: 100%;
}

.field-help {
  width: 100%;
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 991px) {
  .search-panel :deep(.el-form) {
    grid-template-columns: repeat(2, minmax(160px, 1fr));
  }
}

@media (max-width: 767px) {
  .page-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .search-panel :deep(.el-form),
  .form-grid {
    grid-template-columns: 1fr;
  }

  .search-actions .el-button {
    flex: 1;
  }
}
</style>
