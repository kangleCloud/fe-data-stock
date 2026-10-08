<script setup lang="ts">
import { ref } from "vue";

withDefaults(defineProps<{ theme?: "light" | "dark" }>(), { theme: "light" });
const iconFailed = ref(false);
</script>

<template>
  <footer class="beian-footer" :class="`beian-footer--${theme}`" aria-label="网站备案信息">
    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">苏ICP备2025189524号-1</a>
    <a href="https://beian.mps.gov.cn/#/query/webSearch?code=32050802012240" target="_blank" rel="noopener noreferrer">
      <img v-if="!iconFailed" src="https://wiki.kangle.cloud/static/beian.png" width="20" height="20" alt="" @error="iconFailed = true" />
      <span>苏公网安备32050802012240号</span>
    </a>
  </footer>
</template>

<style scoped>
.beian-footer { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 24px; padding: 12px 20px max(12px, env(safe-area-inset-bottom)); color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.beian-footer--dark { color: #bdcadb; }
.beian-footer a { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; max-width: 100%; color: inherit; text-decoration: none; }
.beian-footer a:hover { text-decoration: underline; text-underline-offset: 4px; }
.beian-footer a:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 3px; }
.beian-footer img { width: 20px; height: 20px; flex: 0 0 20px; object-fit: contain; }
.beian-footer span { overflow-wrap: anywhere; }
@media (max-width: 480px) { .beian-footer { flex-direction: column; gap: 0; padding-inline: 16px; } }
</style>
