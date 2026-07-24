<template>
  <main class="entry-view" aria-busy="true">
    <div class="entry-view__mark" aria-hidden="true">V</div>
    <p>正在初始化管理端…</p>
  </main>
</template>

<style scoped>
.entry-view {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 16px;
  color: var(--color-text-secondary);
  background: var(--color-background);
}

.entry-view__mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  background: var(--color-primary);
  box-shadow: var(--shadow-primary);
}
</style>
