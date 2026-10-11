<script setup lang="ts">
import { usePermissionStore } from "@/stores/permission";
const permission = usePermissionStore();
</script>
<template>
  <RouterView v-slot="{ Component, route }">
    <KeepAlive :key="permission.version">
      <component :is="Component" v-if="route.meta.keepAlive" :key="String(route.name || route.path)" />
    </KeepAlive>
    <component :is="Component" v-if="!route.meta.keepAlive" :key="String(route.name || route.path)" />
  </RouterView>
</template>
