<script setup lang="ts">
import { InfoFilled } from "@element-plus/icons-vue";
defineProps<{ title?: string; content: string }>();
</script>
<template>
  <el-popover trigger="click" :width="320">
    <template #reference>
      <el-button text :icon="InfoFilled" :aria-label="title || '查看说明'">
        {{ title || "说明" }}
      </el-button>
    </template>
    <p class="portfolio-tip">{{ content }}</p>
  </el-popover>
</template>
<style scoped>
.portfolio-tip {
  margin: 0;
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
