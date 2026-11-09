import type { Router } from "vue-router";

export function navigateMenu(router: Router, path: string): void {
  const target = router.getRoutes().find((item) => item.path === path);
  if (target?.meta.externalUrl) {
    window.open(target.meta.externalUrl, "_blank", "noopener,noreferrer");
  } else if (path === "/risk/dashboard") {
    window.open("/risk-dashboard/", "_blank", "noopener,noreferrer");
  } else if (path === "/market" || path.startsWith("/market/")) {
    window.location.assign(`/stock-dashboard${path}`);
  } else {
    void router.push(path);
  }
}
