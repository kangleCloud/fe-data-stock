<script setup lang="ts">
import { Monitor } from "@element-plus/icons-vue";
import { riskTime } from "@/utils/riskTime";
import type { RiskDashboardTarget, RiskResourceSummary } from "@/types/riskMonitor";

defineProps<{ targets?: RiskDashboardTarget[] }>();
function bytes(value: string | null | undefined): string {
  if (value == null || !/^\d+$/.test(value)) return "—";
  const amount = BigInt(value); const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
  let divisor = 1n; let unit = 0;
  while (unit < units.length - 1 && amount >= divisor * 1024n) { divisor *= 1024n; unit++; }
  if (!unit) return `${amount} B`;
  const hundredths = amount * 100n / divisor;
  return `${amount * 100n % divisor === 0n ? "" : "≈"}${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")} ${units[unit]}`;
}
function sampleStatus(sample?: RiskResourceSummary | null): string {
  if (!sample) return "暂无样本";
  if (sample.freshness === "UNAVAILABLE") return "不可用";
  const freshness = sample.freshness === "STALE" ? "已过期" : "新鲜";
  const status = sample.status === "SUCCEEDED" ? "采集成功" : sample.status === "PARTIAL" ? "部分可用" : sample.status === "FAILED" ? "采集失败" : "无采集结果";
  return `${freshness} · ${status}`;
}
function percent(value: string | null | undefined): string {
  return value != null && /^\d+(?:\.\d+)?$/.test(value) ? `${value}%` : "—";
}
</script>
<template>
  <section class="panel resource-summary" aria-label="服务器运行监控" tabindex="0">
    <h2><Monitor aria-hidden="true" />服务器运行监控</h2>
    <p v-if="!targets" class="resource-empty">资源状态不可用</p>
    <p v-else-if="!targets.length" class="resource-empty">暂无监控目标</p>
    <ul v-else class="resource-targets">
      <li v-for="target in targets" :key="target.targetId">
        <div class="resource-heading"><strong>{{ target.alias || target.targetId }}</strong><span>{{ target.type === 'LOCAL' ? '本地' : target.type === 'REMOTE' ? '远程' : '类型未知' }}<template v-if="target.enabled === false"> · 已停用</template></span><span :class="{ warning: !target.resourceSummary || target.resourceSummary.freshness !== 'FRESH' || target.resourceSummary.status !== 'SUCCEEDED' }">{{ sampleStatus(target.resourceSummary) }}</span></div>
        <dl><div><dt>CPU</dt><dd>{{ percent(target.resourceSummary?.cpuPercent) }}</dd></div><div><dt>内存</dt><dd>{{ bytes(target.resourceSummary?.memoryUsedBytes) }} / {{ bytes(target.resourceSummary?.memoryTotalBytes) }}</dd></div><div><dt>磁盘</dt><dd>{{ bytes(target.resourceSummary?.diskUsedBytes) }} / {{ bytes(target.resourceSummary?.diskTotalBytes) }}</dd></div></dl>
        <small>采样 {{ riskTime(target.resourceSummary?.sampledAt) }}</small>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.resource-targets { list-style:none; padding:0; margin:0; } .resource-targets li { padding:3px 0 6px; border-bottom:1px solid #14608466; } .resource-heading { display:flex; align-items:center; gap:7px; color:#b9d7e6; font-size:11px; } .resource-heading strong { color:#e8f7ff; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .resource-heading span:last-child { margin-left:auto; white-space:nowrap; color:#42e3c1; } .resource-heading span.warning { color:#ffd37d; } dl { display:flex; flex-wrap:wrap; gap:3px 12px; margin:4px 0 0; font-size:11px; } dl div { display:flex; gap:4px; } dt, small, .resource-empty { color:#a8c9de; } dd { margin:0; color:#e8f7ff; font-variant-numeric:tabular-nums; } small { font-size:10px; }
</style>
