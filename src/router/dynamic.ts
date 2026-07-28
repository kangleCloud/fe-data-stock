import type {
  RouteComponent,
  RouteRecordRaw,
} from "vue-router";

import type { BackendRoute } from "@/types/api";

const viewModules = import.meta.glob<RouteComponent>("../views/**/*.vue");
const AdminLayout = () => import("@/layout/index.vue");
const MarketLayout = () => import("@/layout/MarketLayout.vue");
const RouteLoadError = () => import("@/views/error/RouteLoadError.vue");

function resolveComponent(componentPath: string): {
  component: RouteComponent;
  loadError?: string;
} {
  if (componentPath === "Layout") {
    return { component: AdminLayout };
  }
  if (componentPath === "MarketLayout") {
    return { component: MarketLayout };
  }

  const normalized = componentPath
    .replace(/^\/+/, "")
    .replace(/^views\//, "")
    .replace(/\.vue$/, "");
  const moduleKey = `../views/${normalized}.vue`;
  if (Object.hasOwn(viewModules, moduleKey)) {
    return { component: viewModules[moduleKey] as RouteComponent };
  }

  const loadError = `未找到后端路由组件：${componentPath}（解析为 ${moduleKey}）`;
  console.error(loadError);
  return {
    component: RouteLoadError,
    loadError,
  };
}

function transformRoute(route: BackendRoute): RouteRecordRaw {
  const resolved = resolveComponent(route.component);
  const children = (route.children ?? []).map(transformRoute);
  const routeRecord: RouteRecordRaw = {
    path: route.path || route.routeLink || "/",
    name: route.routeName,
    component: resolved.component,
    meta: {
      title: route.meta?.menuName || route.routeName,
      icon: route.meta?.icon,
      hidden: route.hidden,
      keepAlive: route.meta?.isCache === 1,
      loadError: resolved.loadError,
    },
    children,
  };

  if (children.length > 0) {
    routeRecord.redirect = firstVisiblePath(children) || children[0]?.path;
  }
  return routeRecord;
}

export function buildDynamicRoutes(routes: BackendRoute[]): RouteRecordRaw[] {
  return routes.map(transformRoute);
}

export function firstVisiblePath(routes: RouteRecordRaw[]): string {
  for (const route of routes) {
    if (route.meta?.hidden) {
      continue;
    }
    if (route.children?.length) {
      const childPath = firstVisiblePath(route.children);
      if (childPath) {
        return childPath;
      }
    }
    if (
      route.path &&
      route.component !== AdminLayout &&
      route.component !== MarketLayout
    ) {
      return route.path;
    }
  }
  return "";
}
