import type { Router } from "vue-router";

export function navigateMenu(router: Router, path: string): void {
  const target = router.getRoutes().find((item) => item.path === path);
  if (target?.meta.externalUrl) {
    window.open(target.meta.externalUrl, "_blank", "noopener,noreferrer");
  } else if (path === "/risk/dashboard") {
    window.open(router.resolve(path).href, "_blank", "noopener,noreferrer");
  } else {
    void router.push(path);
  }
}
