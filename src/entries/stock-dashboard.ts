import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "@/App.vue";
import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { useScreenPermissionStore } from "@/stores/screenPermission";
import { AUTH_EXPIRED_EVENT } from "@/utils/request";
import "@/styles/index.css";
import "@/styles/market.css";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: () => import("@/views/entry/index.vue") },
    { path: "/market", component: () => import("@/layout/MarketLayout.vue"), redirect: "/market/overview", children: [
      { path: "overview", component: () => import("@/views/market/overview/index.vue") },
      { path: "stock-monitor", component: () => import("@/views/market/stockMonitor/index.vue") },
      { path: "etf-monitor", component: () => import("@/views/market/etfMonitor/index.vue") },
    ] },
    { path: "/:pathMatch(.*)*", component: () => import("@/views/error/404.vue") },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
window.addEventListener(AUTH_EXPIRED_EVENT, () => {
  useAuthStore(pinia).clearSession();
  useScreenPermissionStore(pinia).reset();
});
if (typeof document !== "undefined" && document.getElementById("app")) {
  createApp(App).use(pinia).use(router).mount("#app");
}
