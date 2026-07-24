<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
  <main class="route-error">
    <el-result
      icon="warning"
      title="页面组件未就绪"
      :sub-title="String(route.meta.loadError || '动态路由组件加载失败')"
    >
      <template #extra>
        <el-button type="primary" @click="$router.replace('/')">
          返回可用页面
        </el-button>
      </template>
    </el-result>
  </main>
</template>

<style scoped>
.route-error {
  min-height: 60vh;
  display: grid;
  place-items: center;
}
</style>
