<script setup lang="ts">
/** 纯布局组件：所有指标、图表与状态由接入层提供，不包含演示数据。 */
defineProps<{ status: string }>();
</script>

<template>
  <section class="risk-screen" aria-label="系统访问分析大屏">
    <header class="risk-heading">
      <div><span class="risk-eyebrow">DATA STOCK / OBSERVABILITY</span><h1>系统访问分析大屏</h1></div>
      <p role="status">{{ status }}</p>
    </header>
    <div class="risk-filters"><slot name="filters" /></div>
    <div class="risk-metrics"><slot name="metrics" /></div>
    <div class="risk-grid">
      <div class="risk-side"><section class="risk-panel"><h2>API 接口请求排行</h2><slot name="interfaces" /></section><section class="risk-panel"><h2>请求类型</h2><slot name="requestTypes" /></section></div>
      <section class="risk-panel risk-geography"><h2>请求来源分布</h2><slot name="regions" /></section>
      <div class="risk-side"><section class="risk-panel"><h2>请求趋势</h2><slot name="trend" /></section><section class="risk-panel"><h2>HTTP 状态分布</h2><slot name="statuses" /></section></div>
    </div>
    <div class="risk-bottom"><section class="risk-panel"><h2>接口访问明细</h2><slot name="details" /></section><section class="risk-panel"><h2>数据质量与异常</h2><slot name="quality" /></section></div>
    <footer class="risk-panel"><slot name="archives" /></footer>
  </section>
</template>

<style scoped>
.risk-screen {
  --risk-background: #061628;
  --risk-panel: #0b2239;
  --risk-border: #285271;
  --risk-text: #edf6ff;
  --risk-muted: #abc7e0;
  --risk-accent: #39d9ed;
  color-scheme: dark;
  background: var(--risk-background);
  color: var(--risk-text);
  padding: var(--space-xl, 16px);
  min-width: 0;
  border-radius: 12px;
}
.risk-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.risk-heading h1 { font-size: clamp(22px, 2vw, 32px); margin: 4px 0 16px; }
.risk-heading p, .risk-eyebrow { color: var(--risk-muted); font-size: 13px; }
.risk-eyebrow { letter-spacing: .12em; }
.risk-filters { margin-bottom: 16px; }
.risk-metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.risk-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr); gap: 12px; }
.risk-side { display: grid; gap: 12px; }
.risk-panel { min-width: 0; padding: 16px; border: 1px solid var(--risk-border); border-radius: 10px; background: var(--risk-panel); }
.risk-panel h2 { font-size: 16px; margin: 0 0 16px; }
.risk-bottom { display: grid; grid-template-columns: minmax(0, 2.4fr) minmax(0, 1fr); gap: 12px; margin: 12px 0; }
.risk-screen :deep(:focus-visible) { outline: 2px solid var(--risk-accent); outline-offset: 3px; }
@media (max-width: 1100px) { .risk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .risk-geography { grid-column: 1 / -1; grid-row: 1; } .risk-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .risk-grid, .risk-bottom { grid-template-columns: minmax(0, 1fr); } .risk-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .risk-screen { padding: 12px; } }
@media (prefers-reduced-motion: reduce) { .risk-screen :deep(*) { animation: none !important; transition: none !important; } }
</style>
