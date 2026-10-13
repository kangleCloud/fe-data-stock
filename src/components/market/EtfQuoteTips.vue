<script setup lang="ts">
import type { ElPopover } from "element-plus";
import { ref } from "vue";
import { QuestionFilled } from "@element-plus/icons-vue";
const tips = ref<InstanceType<typeof ElPopover>>();
</script>

<template>
  <el-popover ref="tips" :trigger="['hover', 'focus', 'click']" :width="280" :show-after="0" placement="bottom-start" effect="dark">
    <template #reference>
      <button type="button" class="etf-quote-tips" @keydown.esc.stop="tips?.hide()"><el-icon><QuestionFilled /></el-icon>行情说明</button>
    </template>
    <div class="etf-quote-tips-content">
      行情来自 AKShare / 新浪，无可靠源时间；卡片和曲线均显示实际采集时间，历史行情不代表已确认收盘。
      价格单位为元，显示三位小数，原始采样不四舍五入。买入价、卖出价为源站报价，缺失或无效时显示“—”。
      仅连接连续真实价格点，超过三分钟或午休缺口断线，不补点、不平滑。
    </div>
  </el-popover>
</template>

<style scoped>
.etf-quote-tips { display: inline-flex; align-items: center; gap: 5px; min-height: 40px; padding: 4px 8px; border: 1px solid var(--market-border); border-radius: 6px; background: transparent; color: var(--market-text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.etf-quote-tips:hover { color: var(--market-text); border-color: var(--market-primary); }
.etf-quote-tips:focus-visible { outline: 2px solid var(--market-primary); outline-offset: 2px; }
.etf-quote-tips-content { font-size: 12px; line-height: 1.7; }
@media (max-width: 767px) { .etf-quote-tips { min-height: 44px; } }
</style>
