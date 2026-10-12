<script setup lang="ts">
import type { ElPopover } from "element-plus";
import { ref } from "vue";
import { QuestionFilled } from "@element-plus/icons-vue";
const tips = ref<InstanceType<typeof ElPopover>>();
</script>

<template>
  <el-popover ref="tips" :trigger="['hover', 'focus', 'click']" :width="280" :show-after="0" placement="bottom-end" effect="dark" popper-class="market-fund-tips">
    <template #reference>
      <button type="button" class="fund-chart-tips" @keydown.esc.stop="tips?.hide()"><el-icon><QuestionFilled /></el-icon>采样说明</button>
    </template>
    <div class="fund-chart-tips-content">
      横轴为实际采集时间，不是源站报价时间。仅展示真实采样，不补点、不平滑；午休、缺失值及超过三分钟的采集缺口断线。
      纵轴单位随有效净额调整；红色为正净额，绿色为负净额，零值为中性。
    </div>
  </el-popover>
</template>

<style scoped>
:global(.market-fund-tips) { background: #101E32 !important; border-color: #263A54 !important; color: #F4F7FB !important; }
.fund-chart-tips { display: inline-flex; align-items: center; gap: 5px; min-height: 40px; padding: 4px 8px; border: 1px solid var(--market-border); border-radius: 6px; background: transparent; color: var(--market-text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.fund-chart-tips:hover { color: var(--market-text); border-color: var(--market-primary); }
.fund-chart-tips:focus-visible { outline: 2px solid var(--market-primary); outline-offset: 2px; }
.fund-chart-tips-content { font-size: 12px; line-height: 1.7; }
@media (max-width: 767px) { .fund-chart-tips { min-height: 44px; } }
</style>
