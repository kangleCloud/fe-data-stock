import { ElMessage } from "element-plus";
import "element-plus/theme-chalk/el-message.css";
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { AUTH_EXPIRED_EVENT, PERMISSION_DENIED_EVENT } from "@/utils/request";

const staticRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Root",
    redirect: "/login",
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: { title: "登录" },
  },
  {
    path: "/403",
    name: "Forbidden",
    component: () => import("@/views/error/403.vue"),
    meta: { title: "无权访问" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("@/views/error/404.vue"),
    meta: { title: "页面不存在" },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: staticRoutes,
  scrollBehavior: () => ({ top: 0 }),
});

let rematchPath: string | null = null;
router.beforeEach(async (to, from) => {
  if (to.path === "/risk/dashboard") {
    window.location.assign(`/risk-dashboard/${to.fullPath.slice(to.path.length)}`);
    return false;
  }
  if (to.path === "/market" || to.path.startsWith("/market/")) {
    window.location.assign(`/stock-dashboard${to.fullPath}`);
    return false;
  }
  if (to.meta.publicAccess) return true;
  const authStore = useAuthStore(pinia);
  const permissionStore = usePermissionStore(pinia);

  if (to.path === "/login") {
    if (!authStore.isAuthenticated) {
      return true;
    }
    try {
      await permissionStore.initialize(router);
      return permissionStore.firstPath;
    } catch {
      authStore.clearSession();
      permissionStore.resetRoutes();
      return true;
    }
  }

  if (!authStore.isAuthenticated) {
    return {
      path: "/login",
      query: to.fullPath === "/" ? {} : { redirect: to.fullPath },
      replace: true,
    };
  }

  if (rematchPath === to.fullPath) { rematchPath = null; return true; }
  if (permissionStore.initialized && !permissionStore.reconciling && to.path !== from.path && to.path !== "/403") {
    try {
      await permissionStore.refresh(router);
      const resolved = router.resolve(to.fullPath);
      if (resolved.name === "NotFound" || resolved.meta.externalUrl || resolved.meta.directory && !resolved.matched.at(-1)?.redirect) return { path: permissionStore.firstPath, replace: true };
      rematchPath = to.fullPath;
      return { path: to.fullPath, replace: true };
    } catch { return { path: "/403", replace: true }; }
  }

  if (!permissionStore.initialized) {
    try {
      await permissionStore.initialize(router);
    } catch (error) {
      authStore.clearSession();
      permissionStore.resetRoutes();
      ElMessage.error(error instanceof Error ? error.message : "初始化权限失败");
      return { path: "/login", replace: true };
    }

    if (permissionStore.routes.length === 0) {
      return { path: "/403", replace: true };
    }
    if (to.path === "/") {
      return { path: permissionStore.firstPath, replace: true };
    }
    if (router.resolve(to.fullPath).name === "NotFound" || router.resolve(to.fullPath).meta.externalUrl) return { path: permissionStore.firstPath, replace: true };
    rematchPath = to.fullPath;
    return { path: to.fullPath, replace: true };
  }

  if (to.path === "/") {
    return { path: permissionStore.firstPath, replace: true };
  }
  return true;
});

if (typeof window !== "undefined") {
  let eventRefresh: Promise<void> | null = null;
  const refreshCurrent = (): void => {
    const auth = useAuthStore(pinia); const permission = usePermissionStore(pinia);
    if (eventRefresh || !auth.isAuthenticated || !permission.initialized) return;
    eventRefresh = permission.refresh(router, true).catch(() => { ElMessage.warning("权限刷新失败，请稍后重试"); }).finally(() => { eventRefresh = null; });
  };
  window.addEventListener(PERMISSION_DENIED_EVENT, refreshCurrent);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshCurrent(); });
  window.addEventListener(AUTH_EXPIRED_EVENT, () => {
    const authStore = useAuthStore(pinia);
    const permissionStore = usePermissionStore(pinia);
    authStore.clearSession();
    permissionStore.resetRoutes();
    if (router.currentRoute.value.path !== "/login" && !router.currentRoute.value.meta.publicAccess) {
      void router.replace({
        path: "/login",
        query: { redirect: router.currentRoute.value.fullPath },
      });
    }
  });
}

export default router;
