<template>
  <main class="error-page">
    <el-result
      icon="warning"
      title="403"
      sub-title="当前账号没有可访问的管理菜单，请联系管理员授权。"
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
