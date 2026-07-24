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
import { AUTH_EXPIRED_EVENT } from "@/utils/request";

const staticRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Root",
    component: () => import("@/views/entry/index.vue"),
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

router.beforeEach(async (to) => {
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
    return { path: to.fullPath, replace: true };
  }

  if (to.path === "/") {
    return { path: permissionStore.firstPath, replace: true };
  }
  return true;
});

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_EXPIRED_EVENT, () => {
    const authStore = useAuthStore(pinia);
    const permissionStore = usePermissionStore(pinia);
    authStore.clearSession();
    permissionStore.resetRoutes();
    if (router.currentRoute.value.path !== "/login") {
      void router.replace({
        path: "/login",
        query: { redirect: router.currentRoute.value.fullPath },
      });
    }
  });
}

export default router;
