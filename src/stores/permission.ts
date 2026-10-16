import { defineStore } from "pinia";
import type { Router, RouteRecordRaw } from "vue-router";
import { getAuthInfo, getAuthRouters } from "@/api/auth";
import { buildDynamicRoutes, portfolioHomePath } from "@/router/dynamic";
import { useAuthStore } from "@/stores/auth";

// Runtime state belongs to each store; concurrent callers share one refresh.
const runtime = new WeakMap<object, { removers: Array<() => void>; pending: Promise<void> | null; navigation: Promise<void> | null; epoch: number }>();
function stateFor(store: object) {
  let state = runtime.get(store);
  if (!state) { state = { removers: [], pending: null, navigation: null, epoch: 0 }; runtime.set(store, state); }
  return state;
}
export const usePermissionStore = defineStore("permission", {
  state: () => ({ routes: [] as RouteRecordRaw[], initialized: false, version: 0, reconciling: false, signature: "" }),
  getters: { firstPath: (state) => portfolioHomePath(state.routes, useAuthStore().permissionCodes) },
  actions: {
    async initialize(router: Router): Promise<void> { if (!this.initialized) await this.refresh(router); },
    async refresh(router: Router, reconcile = false): Promise<void> {
      const state = stateFor(this);
      if (!state.pending) {
        const epoch = state.epoch;
        const auth = useAuthStore();
        const token = auth.credential?.tokenValue;
        state.pending = (async () => {
          const [info, backend] = await Promise.all([getAuthInfo(), getAuthRouters()]);
          if (state.epoch !== epoch || token !== auth.credential?.tokenValue || !auth.isAuthenticated) return;
          const signature = JSON.stringify([backend ?? [], info.roleCodes, info.permissionCodes]);
          auth.setAuthInfo(info);
          if (this.initialized && this.signature === signature) return;
          const routes = buildDynamicRoutes(backend ?? []);
          state.removers.forEach((remove) => remove());
          state.removers = routes.filter((route) => route.path !== "/market").map((route) => router.addRoute(route));
          this.routes = routes; this.initialized = true; this.signature = signature; this.version++;
        })().finally(() => { if (state.epoch === epoch) state.pending = null; });
      }
      await state.pending;
      if (reconcile && this.initialized && !router.currentRoute.value.meta.publicAccess) {
        if (!state.navigation) {
          state.navigation = (async () => {
            const current = router.currentRoute.value;
            const resolved = router.resolve(current.fullPath);
            this.reconciling = true;
            try { await router.replace(resolved.name === "NotFound" || resolved.meta.directory && !resolved.matched.at(-1)?.redirect ? this.firstPath : current.fullPath); }
            finally { this.reconciling = false; }
          })().finally(() => { state.navigation = null; });
        }
        await state.navigation;
      }
    },
    resetRoutes(): void {
      const state = stateFor(this); state.epoch++; state.removers.forEach((remove) => remove()); state.removers = []; state.pending = null;
      this.routes = []; this.initialized = false; this.signature = ""; this.version++;
    },
  },
});
