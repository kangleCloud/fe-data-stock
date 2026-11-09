import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "@/App.vue";
import { getAuthRouters } from "@/api/auth";
import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { useScreenPermissionStore } from "@/stores/screenPermission";
import type { BackendRoute } from "@/types/api";
import { AUTH_EXPIRED_EVENT } from "@/utils/request";
import "@/styles/index.css";

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes: [
  { path: "/", component: () => import("@/views/risk/dashboard/index.vue") },
  { path: "/403", component: () => import("@/views/error/403.vue") },
  { path: "/:pathMatch(.*)*", component: () => import("@/views/error/404.vue") },
] });
function hasRiskRoute(routes: BackendRoute[], parent = ""): boolean {
  return routes.some((route) => {
    if (route.status === 0) return false;
    const raw = route.path || route.routeLink || "/";
    const path = raw.startsWith("/") ? raw : `${parent}/${raw}`;
    return path === "/risk/dashboard" || hasRiskRoute(route.children ?? [], path);
  });
}
function login(): void {
  const redirect = `${location.pathname}${location.search}${location.hash}`;
  location.assign(`/admin/login?redirect=${encodeURIComponent(redirect)}`);
}
router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia);
  if (!auth.isAuthenticated) { login(); return false; }
  if (to.path === "/403") return true;
  try {
    await useScreenPermissionStore(pinia).initialize();
    const routes = await getAuthRouters();
    return hasRiskRoute(routes ?? []) ? true : "/403";
  } catch {
    if (!auth.isAuthenticated) login();
    return false;
  }
});
window.addEventListener(AUTH_EXPIRED_EVENT, () => { useAuthStore(pinia).clearSession(); login(); });
createApp(App).use(pinia).use(router).mount("#app");
