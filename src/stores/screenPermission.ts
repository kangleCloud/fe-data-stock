import { defineStore } from "pinia";
import { getAuthInfo } from "@/api/auth";
import { useAuthStore } from "@/stores/auth";

export const useScreenPermissionStore = defineStore("screenPermission", {
  state: () => ({ initialized: false }),
  actions: {
    async initialize(): Promise<void> {
      if (this.initialized) return;
      const auth = useAuthStore();
      const token = auth.credential?.tokenValue;
      const info = await getAuthInfo();
      if (token && auth.credential?.tokenValue === token) {
        auth.setAuthInfo(info);
        this.initialized = true;
      }
    },
    reset(): void { this.initialized = false; },
  },
});
