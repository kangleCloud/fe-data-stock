<script setup lang="ts">
import {
  ArrowDown,
  Back,
  Refresh,
  SwitchButton,
  TrendCharts,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import "element-plus/theme-chalk/el-message-box.css";
import { computed } from "vue";
import type { RouteRecordRaw } from "vue-router";
import { useRoute, useRouter } from "vue-router";

import { useMarketRefresh } from "@/composables/useMarketRefresh";
import { useAuthStore } from "@/stores/auth";
import { useMarketStore } from "@/stores/market";
import { usePermissionStore } from "@/stores/permission";
import { formatDateTime, tradeStatusLabels } from "@/utils/market";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const marketStore = useMarketStore();
const permissionStore = usePermissionStore();
const { countdownLabel, manualRefresh, refreshing } = useMarketRefresh();

const avatarText = computed(() =>
  authStore.displayName.trim().slice(0, 1).toUpperCase(),
);
const tradeStatus = computed(() => marketStore.status?.tradeStatus || "UNKNOWN");
const lastUpdated = computed(() =>
  formatDateTime(
    marketStore.status?.lastValidDataTime || marketStore.status?.lastRefreshAt,
  ),
);

function findAdminPath(routes: RouteRecordRaw[]): string {
  for (const item of routes) {
    if (item.meta?.hidden || item.path.startsWith("/market")) continue;
    const childPath = item.children ? findAdminPath(item.children) : "";
    if (childPath) return childPath;
    if (item.path && item.path !== "/") return item.path;
  }
  return "/";
}

async function handleLogout(): Promise<void> {
  await ElMessageBox.confirm("确定退出行情大屏吗？", "退出登录", {
    confirmButtonText: "退出",
    cancelButtonText: "取消",
    type: "warning",
  });
  await authStore.logout();
  permissionStore.resetRoutes();
  ElMessage.success("已安全退出");
  await router.replace("/login");
}
</script>

<template>
  <div class="market-shell">
    <a class="market-skip-link" href="#market-content">跳到行情内容</a>
    <header class="market-topbar">
      <div class="market-brand">
        <span class="market-brand__mark"><TrendCharts /></span>
        <span>
          <strong>A股行情数据大屏</strong>
          <small>VITA MARKET INTELLIGENCE</small>
        </span>
      </div>

      <nav class="market-view-nav" aria-label="行情视图">
        <RouterLink
          to="/market/overview"
          :class="{ 'is-active': route.path === '/market/overview' }"
        >
          大盘与板块总览
        </RouterLink>
        <RouterLink
          to="/market/stockMonitor"
          :class="{ 'is-active': route.path === '/market/stockMonitor' }"
        >
          个股资金监控
        </RouterLink>
      </nav>

      <div class="market-topbar__status">
        <span class="trade-status" :class="`is-${tradeStatus.toLowerCase()}`">
          <i />
          {{ tradeStatusLabels[tradeStatus] }}
        </span>
        <span class="status-copy">
          <small>交易日期</small>
          <b>{{ marketStore.status?.tradeDate || "—" }}</b>
        </span>
        <span class="status-copy">
          <small>最后更新</small>
          <b>{{ lastUpdated }}</b>
        </span>
        <button
          class="market-icon-button refresh-button"
          type="button"
          :disabled="refreshing"
          :aria-label="`手动刷新，距下次刷新 ${countdownLabel}`"
          @click="manualRefresh"
        >
          <el-icon :class="{ 'is-spinning': refreshing }"><Refresh /></el-icon>
          <span>{{ countdownLabel }}</span>
        </button>
        <button
          class="market-icon-button back-button"
          type="button"
          @click="router.push(findAdminPath(permissionStore.routes))"
        >
          <el-icon><Back /></el-icon><span>管理端</span>
        </button>
        <el-dropdown trigger="click">
          <button class="market-user-menu" type="button" aria-label="打开用户菜单">
            <span>{{ avatarText }}</span>
            <strong>{{ authStore.displayName }}</strong>
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
      </div>
    </header>

    <p v-if="marketStore.statusError" class="market-global-error" aria-live="polite">
      状态服务暂不可用，页面将保留最后有效数据。{{ marketStore.statusError }}
    </p>
    <main id="market-content" class="market-content" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
