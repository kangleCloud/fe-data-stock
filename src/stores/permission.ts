import { defineStore } from "pinia";
import type { Router, RouteRecordRaw } from "vue-router";

import { getAuthInfo, getAuthRouters } from "@/api/auth";
import {
  buildDynamicRoutes,
  firstVisiblePath,
} from "@/router/dynamic";
import { useAuthStore } from "@/stores/auth";

let removeRouteHandlers: Array<() => void> = [];
let initializationPromise: Promise<void> | null = null;

interface PermissionState {
  routes: RouteRecordRaw[];
  initialized: boolean;
}

export const usePermissionStore = defineStore("permission", {
  state: (): PermissionState => ({
    routes: [],
    initialized: false,
  }),
  getters: {
    firstPath: (state) => firstVisiblePath(state.routes) || "/403",
  },
  actions: {
    async initialize(router: Router): Promise<void> {
      if (this.initialized) {
        return;
      }
      if (initializationPromise) {
        return initializationPromise;
      }

      initializationPromise = (async () => {
        const [authInfo, backendRoutes] = await Promise.all([
          getAuthInfo(),
          getAuthRouters(),
        ]);
        useAuthStore().setAuthInfo(authInfo);

        const routes = buildDynamicRoutes(backendRoutes ?? []);
        removeRouteHandlers = routes.map((route) => router.addRoute(route));
        this.routes = routes;
        this.initialized = true;
      })();

      try {
        await initializationPromise;
      } finally {
        initializationPromise = null;
      }
    },
    resetRoutes(): void {
      removeRouteHandlers.forEach((removeRoute) => removeRoute());
      removeRouteHandlers = [];
      initializationPromise = null;
      this.routes = [];
      this.initialized = false;
    },
  },
});
