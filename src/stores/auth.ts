import { defineStore } from "pinia";

import * as authApi from "@/api/auth";
import type {
  AuthInfo,
  LoginRequest,
  LoginResponse,
  LoginUserInfo,
  StoredCredential,
} from "@/types/api";
import {
  clearCredential,
  getCredential,
  saveCredential,
} from "@/utils/storage";

interface AuthState {
  credential: StoredCredential | null;
  userInfo: LoginUserInfo | null;
  roleCodes: string[];
  permissionCodes: string[];
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    credential: getCredential(),
    userInfo: null,
    roleCodes: [],
    permissionCodes: [],
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.credential),
    displayName: (state) =>
      state.userInfo?.nickName || state.userInfo?.username || "管理员",
  },
  actions: {
    async authenticate(payload: LoginRequest): Promise<LoginResponse> {
      const result = await authApi.login(payload);
      this.credential = saveCredential(result);
      return result;
    },
    setAuthInfo(info: AuthInfo): void {
      this.userInfo = info.userInfo;
      this.roleCodes = info.roleCodes ?? [];
      this.permissionCodes = info.permissionCodes ?? [];
    },
    clearSession(): void {
      clearCredential();
      this.credential = null;
      this.userInfo = null;
      this.roleCodes = [];
      this.permissionCodes = [];
    },
    async logout(): Promise<void> {
      try {
        if (this.credential) {
          await authApi.logout();
        }
      } finally {
        this.clearSession();
      }
    },
  },
});
