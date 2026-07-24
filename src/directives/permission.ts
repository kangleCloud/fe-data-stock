import type { Directive, DirectiveBinding } from "vue";

import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";

function applyPermission(
  element: HTMLElement,
  binding: DirectiveBinding<string | string[]>,
): void {
  const authStore = useAuthStore();
  if (!canAccess(authStore.permissionCodes, binding.value)) {
    element.remove();
  }
}

export const permissionDirective: Directive<HTMLElement, string | string[]> = {
  mounted: applyPermission,
  updated: applyPermission,
};
