<script setup lang="ts">
import { Menu as MenuIcon } from "@element-plus/icons-vue";
import { computed } from "vue";
import type { RouteRecordRaw } from "vue-router";
import { menuIcons } from "@/layout/components/menuIcons";

defineOptions({ name: "SidebarItem" });
const props = defineProps<{ route: RouteRecordRaw }>();
const emit = defineEmits<{ navigate: [path: string] }>();
const children = computed(() => visibleChildren(props.route));

const visibleChildren = (route: RouteRecordRaw): RouteRecordRaw[] =>
  (route.children ?? []).filter((child) => !child.meta?.hidden && (!child.meta?.directory || child.meta?.externalUrl || visibleChildren(child).length));
</script>

<template>
  <el-sub-menu
    v-if="children.length"
    :index="route.path"
  >
    <template #title>
      <el-icon>
        <component :is="menuIcons[String(route.meta?.icon)] || MenuIcon" />
      </el-icon>
      <span>{{ route.meta?.title || route.name }}</span>
    </template>
    <SidebarItem
      v-for="child in children"
      :key="String(child.name || child.path)"
      :route="child"
      @navigate="emit('navigate', $event)"
    />
  </el-sub-menu>

  <el-menu-item
    v-else-if="!route.meta?.directory || route.meta?.externalUrl"
    :index="route.path"
    @click="emit('navigate', route.path)"
  >
    <el-icon>
      <component :is="menuIcons[String(route.meta?.icon)] || MenuIcon" />
    </el-icon>
    <template #title>
      {{ route.meta?.title || route.name }}
    </template>
  </el-menu-item>
</template>
