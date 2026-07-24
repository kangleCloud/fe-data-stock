<script setup lang="ts">
import {
  Menu as MenuIcon,
  Setting,
  User,
  UserFilled,
} from "@element-plus/icons-vue";
import type { Component } from "vue";
import type { RouteRecordRaw } from "vue-router";

defineOptions({ name: "SidebarItem" });

defineProps<{
  route: RouteRecordRaw;
}>();

const iconMap: Record<string, Component> = {
  setting: Setting,
  user: User,
  peoples: UserFilled,
  menu: MenuIcon,
};

const visibleChildren = (route: RouteRecordRaw) =>
  (route.children ?? []).filter((child) => !child.meta?.hidden);
</script>

<template>
  <el-sub-menu
    v-if="visibleChildren(route).length"
    :index="route.path"
  >
    <template #title>
      <el-icon>
        <component :is="iconMap[String(route.meta?.icon)] || MenuIcon" />
      </el-icon>
      <span>{{ route.meta?.title || route.name }}</span>
    </template>
    <SidebarItem
      v-for="child in visibleChildren(route)"
      :key="String(child.name || child.path)"
      :route="child"
    />
  </el-sub-menu>

  <el-menu-item
    v-else
    :index="route.path"
  >
    <el-icon>
      <component :is="iconMap[String(route.meta?.icon)] || MenuIcon" />
    </el-icon>
    <template #title>
      {{ route.meta?.title || route.name }}
    </template>
  </el-menu-item>
</template>
