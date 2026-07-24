<template>
  <main class="error-page">
    <el-result
      icon="info"
      title="404"
      sub-title="页面不存在，或当前路由尚未配置。"
    >
      <template #extra>
        <el-button type="primary" @click="$router.replace('/')">
          返回首页
        </el-button>
      </template>
    </el-result>
  </main>
</template>

<style scoped>
.error-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--color-background);
}
</style>
