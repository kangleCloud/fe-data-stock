<script setup lang="ts">
import {
  ArrowDown,
  Expand,
  Fold,
  Menu as MenuIcon,
  SwitchButton,
  TrendCharts,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import "element-plus/theme-chalk/el-message-box.css";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import type { RouteRecordRaw } from "vue-router";
import { useRoute, useRouter } from "vue-router";

import SidebarItem from "@/layout/components/SidebarItem.vue";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();

const collapsed = ref(false);
const mobileDrawerOpen = ref(false);
const isMobile = ref(false);
let mediaQuery: MediaQueryList | null = null;

const visibleRoutes = computed(() =>
  permissionStore.routes.filter((item) => !item.meta?.hidden),
);

const breadcrumbItems = computed(() =>
  route.matched.filter((item) => item.meta?.title),
);

const avatarText = computed(() =>
  authStore.displayName.trim().slice(0, 1).toUpperCase(),
);

function updateViewport(event?: MediaQueryListEvent): void {
  isMobile.value = event?.matches ?? mediaQuery?.matches ?? false;
  if (!isMobile.value) {
    mobileDrawerOpen.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await ElMessageBox.confirm(
    "退出后需要重新验证身份，确定继续吗？",
    "退出登录",
    {
      confirmButtonText: "退出",
      cancelButtonText: "取消",
      type: "warning",
    },
  );
  await authStore.logout();
  permissionStore.resetRoutes();
  ElMessage.success("已安全退出");
  await router.replace("/login");
}

function goToRoute(path: string): void {
  mobileDrawerOpen.value = false;
  void router.push(path);
}

onMounted(() => {
  mediaQuery = window.matchMedia("(max-width: 991px)");
  updateViewport();
  mediaQuery.addEventListener("change", updateViewport);
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener("change", updateViewport);
});
</script>

<template>
  <div class="admin-shell" :class="{ 'is-collapsed': collapsed }">
    <a class="skip-link" href="#main-content">跳到主要内容</a>

    <aside v-if="!isMobile" class="admin-sidebar" aria-label="主导航">
      <div class="brand">
        <span class="brand__mark">
          <TrendCharts />
        </span>
        <span v-show="!collapsed" class="brand__copy">
          <strong>Vita Stock</strong>
          <small>数据管理中心</small>
        </span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        class="sidebar-menu"
      >
        <SidebarItem
          v-for="item in visibleRoutes"
          :key="String(item.name || item.path)"
          :route="item"
        />
      </el-menu>
      <button
        class="sidebar-collapse"
        type="button"
        :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="collapsed = !collapsed"
      >
        <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
        <span v-show="!collapsed">收起导航</span>
      </button>
    </aside>

    <el-drawer
      v-model="mobileDrawerOpen"
      direction="ltr"
      size="280px"
      :with-header="false"
      class="mobile-nav"
    >
      <div class="brand brand--mobile">
        <span class="brand__mark"><TrendCharts /></span>
        <span class="brand__copy">
          <strong>Vita Stock</strong>
          <small>数据管理中心</small>
        </span>
      </div>
      <el-menu :default-active="route.path" class="sidebar-menu">
        <template v-for="item in visibleRoutes" :key="String(item.name)">
          <el-sub-menu v-if="item.children?.length" :index="item.path">
            <template #title>
              <el-icon><MenuIcon /></el-icon>
              <span>{{ item.meta?.title }}</span>
            </template>
            <el-menu-item
              v-for="child in (item.children as RouteRecordRaw[])"
              :key="child.path"
              :index="child.path"
              @click="goToRoute(child.path)"
            >
              {{ child.meta?.title }}
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.path" @click="goToRoute(item.path)">
            {{ item.meta?.title }}
          </el-menu-item>
        </template>
      </el-menu>
    </el-drawer>

    <div class="admin-main">
      <header class="admin-header">
        <div class="header-leading">
          <button
            v-if="isMobile"
            class="icon-button"
            type="button"
            aria-label="打开导航"
            @click="mobileDrawerOpen = true"
          >
            <el-icon><MenuIcon /></el-icon>
          </button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>管理端</el-breadcrumb-item>
            <el-breadcrumb-item
              v-for="item in breadcrumbItems"
              :key="item.path"
            >
              {{ item.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <el-dropdown trigger="click">
          <button class="user-menu" type="button" aria-label="打开用户菜单">
            <span class="user-menu__avatar">{{ avatarText }}</span>
            <span class="user-menu__copy">
              <strong>{{ authStore.displayName }}</strong>
              <small>{{ authStore.roleCodes.join(" / ") || "已登录" }}</small>
            </span>
            <el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :icon="SwitchButton" @click="handleLogout">
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main id="main-content" class="admin-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
}

.skip-link {
  position: fixed;
  z-index: 3000;
  top: 8px;
  left: 8px;
  padding: 8px 12px;
  color: #fff;
  border-radius: 8px;
  background: var(--color-primary);
  transform: translateY(-150%);
  transition: transform var(--transition-fast);
}

.skip-link:focus {
  transform: translateY(0);
}

.admin-sidebar {
  position: fixed;
  z-index: 100;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: width var(--transition-fast);
}

.is-collapsed .admin-sidebar {
  width: var(--sidebar-width-collapsed);
}

.brand {
  height: var(--header-height);
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
}

.brand__mark {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 7px;
  color: #fff;
  border-radius: 10px;
  background: var(--color-primary);
  box-shadow: 0 8px 18px rgb(37 99 235 / 18%);
}

.brand__copy {
  display: grid;
  white-space: nowrap;
}

.brand__copy strong {
  font-size: 15px;
  letter-spacing: -0.01em;
}

.brand__copy small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.brand--mobile {
  margin-bottom: 12px;
}

.sidebar-menu {
  flex: 1;
  border-right: 0;
  padding: 10px 8px;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 100%;
}

.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  min-height: 44px;
  margin: 3px 0;
  border-radius: 8px;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  color: var(--color-primary);
  font-weight: 600;
  background: var(--color-primary-soft);
}

.sidebar-collapse {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 21px;
  color: var(--color-text-secondary);
  border: 0;
  border-top: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
}

.sidebar-collapse:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.admin-main {
  min-height: 100vh;
  margin-left: var(--sidebar-width);
  transition: margin-left var(--transition-fast);
}

.is-collapsed .admin-main {
  margin-left: var(--sidebar-width-collapsed);
}

.admin-header {
  position: sticky;
  z-index: 90;
  top: 0;
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
  background: rgb(255 255 255 / 92%);
  backdrop-filter: blur(12px);
}

.header-leading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-button {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  color: var(--color-text);
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

.icon-button:hover {
  background: var(--color-primary-soft);
}

.user-menu {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 8px 4px 5px;
  color: var(--color-text);
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.user-menu:hover {
  background: var(--color-surface-subtle);
}

.user-menu__avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--color-primary);
  font-weight: 700;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: var(--color-primary-soft);
}

.user-menu__copy {
  min-width: 92px;
  display: grid;
  text-align: left;
}

.user-menu__copy strong {
  font-size: 13px;
}

.user-menu__copy small {
  max-width: 150px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-content {
  min-height: calc(100vh - var(--header-height));
  padding: 24px;
}

@media (max-width: 991px) {
  .admin-main,
  .is-collapsed .admin-main {
    margin-left: 0;
  }

  .admin-header {
    padding: 0 14px;
  }

  .admin-content {
    padding: 16px;
  }
}

@media (max-width: 575px) {
  .user-menu__copy {
    display: none;
  }

  .admin-header :deep(.el-breadcrumb__item:first-child) {
    display: none;
  }
}
</style>
