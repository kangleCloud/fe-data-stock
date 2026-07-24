<script setup lang="ts">
import {
  Delete,
  EditPen,
  Lock,
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
  createUser,
  deleteUser,
  getUserDetail,
  getUserPage,
  updateUser,
} from "@/api/user";
import type {
  EntityId,
  SysUser,
  UserCreateRequest,
  UserSearchQuery,
  UserUpdateRequest,
} from "@/types/api";
import { pageAfterSingleRowDelete } from "@/utils/pagination";
import { validateManagedUserPassword } from "@/utils/validation";

interface UserFormModel {
  id?: EntityId;
  deptId?: EntityId;
  nickName: string;
  userName: string;
  password: string;
  mobile: string;
  email: string;
  gender: string;
  status: number;
  remark: string;
}

const loading = ref(false);
const submitting = ref(false);
const drawerVisible = ref(false);
const editing = ref(false);
const total = ref(0);
const rows = ref<SysUser[]>([]);
const formRef = ref<FormInstance>();

const query = reactive<UserSearchQuery>({
  pageNum: 1,
  pageSize: 10,
  userName: "",
  nickName: "",
  mobile: "",
  status: undefined,
});

const createEmptyForm = (): UserFormModel => ({
  id: undefined,
  deptId: undefined,
  nickName: "",
  userName: "",
  password: "",
  mobile: "",
  email: "",
  gender: "2",
  status: 1,
  remark: "",
});

const form = reactive<UserFormModel>(createEmptyForm());

const rules: FormRules<UserFormModel> = {
  userName: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    { min: 4, max: 32, message: "用户名长度为 4–32 位", trigger: "blur" },
  ],
  password: [
    {
      validator: (_rule, value: string, callback) => {
        const message = validateManagedUserPassword(value, editing.value);
        if (message) {
          callback(new Error(message));
          return;
        }
        callback();
      },
      trigger: "blur",
    },
  ],
  mobile: [
    {
      pattern: /^$|^1\d{10}$/,
      message: "请输入正确的 11 位手机号",
      trigger: "blur",
    },
  ],
  email: [
    {
      type: "email",
      message: "请输入正确的邮箱地址",
      trigger: "blur",
    },
  ],
  status: [{ required: true, message: "请选择状态", trigger: "change" }],
};

function formatDateTime(value?: string): string {
  return value ? value.replace("T", " ") : "—";
}

function isProtected(user: SysUser): boolean {
  return user.isSystem === 1 || user.isSuperAdmin === 1;
}

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    const result = await getUserPage(query);
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
    userName: "",
    nickName: "",
    mobile: "",
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

async function openEdit(row: SysUser): Promise<void> {
  editing.value = true;
  resetForm();
  const detail = await getUserDetail(row.id);
  Object.assign(form, {
    id: detail.id,
    deptId: detail.deptId,
    nickName: detail.nickName ?? "",
    userName: detail.userName,
    password: "",
    mobile: detail.mobile ?? "",
    email: detail.email ?? "",
    gender: detail.gender ?? "2",
    status: detail.status,
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
    const basePayload = {
      deptId: form.deptId || undefined,
      nickName: form.nickName.trim(),
      userName: form.userName.trim(),
      mobile: form.mobile.trim(),
      email: form.email.trim(),
      gender: form.gender,
      status: form.status,
      remark: form.remark.trim(),
    };
    if (editing.value && form.id != null) {
      const payload: UserUpdateRequest = {
        ...basePayload,
        id: form.id,
      };
      if (form.password) {
        payload.password = form.password;
      }
      await updateUser(payload);
      ElMessage.success("用户信息已更新");
    } else {
      const payload: UserCreateRequest = {
        ...basePayload,
        password: form.password,
      };
      await createUser(payload);
      ElMessage.success("用户创建成功");
    }
    drawerVisible.value = false;
    await loadData();
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: SysUser): Promise<void> {
  await ElMessageBox.confirm(
    `确定删除用户“${row.nickName || row.userName}”吗？此操作不可撤销。`,
    "删除用户",
    {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    },
  );
  await deleteUser(row.id);
  query.pageNum = pageAfterSingleRowDelete(query.pageNum, rows.value.length);
  ElMessage.success("用户已删除");
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <section class="management-page" aria-labelledby="user-page-title">
    <header class="page-heading">
      <div>
        <h1 id="user-page-title" class="page-title">用户管理</h1>
        <p class="page-description">
          管理后台账号、基础资料与启用状态。
        </p>
      </div>
      <el-button
        v-permission="'system:user:add'"
        type="primary"
        :icon="Plus"
        @click="openCreate"
      >
        新增用户
      </el-button>
    </header>

    <div class="page-panel search-panel">
      <el-form :model="query" inline label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="用户名">
          <el-input
            v-model.trim="query.userName"
            clearable
            placeholder="输入用户名"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input
            v-model.trim="query.nickName"
            clearable
            placeholder="输入昵称"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input
            v-model.trim="query.mobile"
            clearable
            placeholder="输入手机号"
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
          <strong>用户列表</strong>
          <span>共 {{ total }} 个账号</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        stripe
        empty-text="暂无符合条件的用户"
      >
        <el-table-column label="用户" min-width="170" fixed="left">
          <template #default="{ row }">
            <div class="identity-cell">
              <span class="identity-avatar">
                {{ (row.nickName || row.userName).slice(0, 1) }}
              </span>
              <span>
                <strong>{{ row.nickName || "未设置昵称" }}</strong>
                <small>{{ row.userName }}</small>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="deptId" label="部门 ID" width="100">
          <template #default="{ row }">{{ row.deptId || "—" }}</template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="190">
          <template #default="{ row }">
            <div class="stacked-cell">
              <span>{{ row.mobile || "未填写手机号" }}</span>
              <small>{{ row.email || "未填写邮箱" }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="light">
              {{ row.status === 1 ? "启用" : "禁用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="账号类型" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.isSuperAdmin === 1" type="warning" effect="plain">
              超级管理员
            </el-tag>
            <el-tag v-else-if="row.isSystem === 1" effect="plain">
              系统内置
            </el-tag>
            <span v-else>普通用户</span>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" min-width="180">
          <template #default="{ row }">
            <div class="stacked-cell">
              <span>{{ formatDateTime(row.loginTime) }}</span>
              <small>{{ row.loginAddress || "暂无登录地址" }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-permission="'system:user:update'"
              link
              type="primary"
              :icon="EditPen"
              @click="openEdit(row as SysUser)"
            >
              编辑
            </el-button>
            <el-tooltip
              :disabled="!isProtected(row as SysUser)"
              content="系统内置或超级管理员账号不可删除"
            >
              <span>
                <el-button
                  v-permission="'system:user:delete'"
                  link
                  type="danger"
                  :icon="Delete"
                  :disabled="isProtected(row as SysUser)"
                  @click="handleDelete(row as SysUser)"
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
      :title="editing ? '编辑用户' : '新增用户'"
      size="min(560px, 92vw)"
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
          <el-form-item label="用户名" prop="userName">
            <el-input
              v-model.trim="form.userName"
              maxlength="32"
              autocomplete="off"
              placeholder="4–32 位登录账号"
            />
          </el-form-item>
          <el-form-item label="用户昵称">
            <el-input
              v-model.trim="form.nickName"
              maxlength="50"
              placeholder="用于界面展示"
            />
          </el-form-item>
          <el-form-item
            :label="editing ? '重置密码（可选）' : '登录密码'"
            prop="password"
          >
            <el-input
              v-model="form.password"
              type="password"
              show-password
              maxlength="64"
              autocomplete="new-password"
              :prefix-icon="Lock"
              :placeholder="editing ? '留空则保持原密码' : '8–64 位密码'"
            />
          </el-form-item>
          <el-form-item label="部门 ID">
            <el-input
              v-model="form.deptId"
              inputmode="numeric"
              placeholder="可选"
            />
          </el-form-item>
          <el-form-item label="手机号" prop="mobile">
            <el-input
              v-model.trim="form.mobile"
              inputmode="tel"
              maxlength="20"
              placeholder="可选"
            />
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model.trim="form.email"
              inputmode="email"
              maxlength="100"
              placeholder="可选"
            />
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="form.gender">
              <el-option label="女" value="0" />
              <el-option label="男" value="1" />
              <el-option label="其他 / 未指定" value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="账号状态" prop="status">
            <el-radio-group v-model="form.status">
              <el-radio-button :value="1">启用</el-radio-button>
              <el-radio-button :value="0">禁用</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="记录账号用途或管理说明"
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
  grid-template-columns: repeat(4, minmax(150px, 1fr)) auto;
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

.identity-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.identity-avatar {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  border-radius: 9px;
  background: var(--color-primary-soft);
}

.identity-cell > span:last-child,
.stacked-cell {
  min-width: 0;
  display: grid;
}

.identity-cell strong {
  font-size: 14px;
}

.identity-cell small,
.stacked-cell small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 1199px) {
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

  .search-actions :deep(.el-form-item__content) {
    width: 100%;
  }

  .search-actions .el-button {
    flex: 1;
  }
}
</style>
