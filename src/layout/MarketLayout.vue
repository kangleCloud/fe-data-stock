<script setup lang="ts">
import { ArrowDown, Back, SwitchButton, TrendCharts } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import "element-plus/theme-chalk/el-message-box.css";
import { computed } from "vue";

import { useAuthStore } from "@/stores/auth";
import { useScreenPermissionStore } from "@/stores/screenPermission";

const authStore = useAuthStore();
const permissionStore = useScreenPermissionStore();
const avatarText = computed(() => authStore.displayName.trim().slice(0, 1).toUpperCase());

function openAdmin(): void {
  window.location.assign("/admin/");
}

async function handleLogout(): Promise<void> {
  await ElMessageBox.confirm("确定退出行情大屏吗？", "退出登录", {
    confirmButtonText: "退出",
    cancelButtonText: "取消",
    type: "warning",
    customClass: "market-dark-dialog",
  });
  await authStore.logout();
  permissionStore.reset();
  ElMessage.success("已安全退出");
  window.location.assign("/admin/login");
}
</script>

<template>
  <div class="market-shell">
    <a class="market-skip-link" href="#market-content">跳到行情内容</a>
    <header class="market-topbar">
      <div class="market-topbar__inner">
        <div class="market-brand">
          <span class="market-brand__mark"><TrendCharts /></span>
          <span>
            <strong>A股行情数据大屏</strong>
            <small>VITA MARKET INTELLIGENCE</small>
          </span>
        </div>

        <nav class="market-view-nav" aria-label="行情视图">
          <RouterLink to="/" exact-active-class="is-active">首页</RouterLink>
          <RouterLink to="/market/overview" active-class="is-active">市场与资金总览</RouterLink>
          <RouterLink to="/market/stock-monitor" active-class="is-active">个股监控</RouterLink>
          <RouterLink to="/market/etf-monitor" active-class="is-active">ETF 监控</RouterLink>
        </nav>

        <div class="market-topbar__status">
          <button
            v-if="authStore.isAuthenticated"
            class="market-icon-button back-button"
            type="button"
            @click="openAdmin"
          >
            <el-icon><Back /></el-icon><span>管理端</span>
          </button>
          <a v-else class="market-icon-button market-login-link" href="/admin/login">登录管理端</a>
          <el-dropdown v-if="authStore.isAuthenticated" trigger="click" popper-class="market-dark-popper">
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
      </div>
    </header>

    <main id="market-content" class="market-content" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
