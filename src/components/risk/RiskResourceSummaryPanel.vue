<script setup lang="ts">
import { Monitor, Top, Bottom } from "@element-plus/icons-vue";
import { riskCountPercent, riskCountRatio } from "@/utils/riskBars";
import { riskNetworkMbps } from "@/utils/riskDashboardVisual";
import { riskTime } from "@/utils/riskTime";
import type { RiskDashboardTarget, RiskResourceSummary } from "@/types/riskMonitor";

defineProps<{ targets?: RiskDashboardTarget[] }>();
function sampleStatus(sample?: RiskResourceSummary | null): string {
  if (!sample) return "暂无样本";
  if (sample.freshness === "UNAVAILABLE") return "不可用";
  if (sample.freshness === "STALE") return "已过期";
  return sample.status === "SUCCEEDED" ? "在线" : sample.status === "PARTIAL" ? "部分可用" : sample.status === "FAILED" ? "采集失败" : "无采集结果";
}
function usableSample(sample?: RiskResourceSummary | null) {
  return sample?.freshness === "FRESH" && (sample.status === "SUCCEEDED" || sample.status === "PARTIAL") ? sample : undefined;
}
function usage(label: string, used?: string | null, total?: string | null) {
  if (!used || !total || !/^\d+$/.test(used) || !/^\d+$/.test(total) || BigInt(total) === 0n) return { label, value: "—", width: undefined };
  const amount = BigInt(used);
  const capacity = BigInt(total);
  return { label, value: riskCountPercent(amount, capacity).replace(/\.00%$/, "%"), width: Math.min(100, riskCountRatio(amount, capacity) * 100) };
}
function resourceMetrics(rawSample?: RiskResourceSummary | null) {
  const sample = usableSample(rawSample);
  const cpu = sample?.cpuPercent && /^\d+(?:\.\d+)?$/.test(sample.cpuPercent) ? Number(sample.cpuPercent) : Number.NaN;
  return [
    { label: "CPU", value: Number.isFinite(cpu) ? `${Number(cpu.toFixed(2))}%` : "—", width: Number.isFinite(cpu) ? Math.min(100, cpu) : undefined },
    usage("内存", sample?.memoryUsedBytes, sample?.memoryTotalBytes),
    usage("磁盘", sample?.diskUsedBytes, sample?.diskTotalBytes),
  ];
}
</script>
<template>
  <section class="panel resource-summary" aria-label="服务器运行监控">
    <h2><Monitor aria-hidden="true" />服务器运行监控 <slot name="action" /></h2>
    <p v-if="!targets" class="resource-empty">资源状态不可用</p>
    <p v-else-if="!targets.length" class="resource-empty">暂无监控目标</p>
    <ul v-else class="resource-targets" tabindex="0" aria-label="监控目标资源列表">
      <li v-for="target in targets" :key="target.targetId">
        <div class="resource-heading"><strong :title="target.alias || target.targetId">{{ target.alias || target.targetId }}</strong><span>{{ target.type === 'LOCAL' ? '本地' : target.type === 'REMOTE' ? '远程' : '类型未知' }}<template v-if="target.enabled === false"> · 已停用</template></span><span :class="{ warning: !target.resourceSummary || target.resourceSummary.freshness !== 'FRESH' || target.resourceSummary.status !== 'SUCCEEDED' }">{{ sampleStatus(target.resourceSummary) }}</span></div>
        <dl>
          <div v-for="metric in resourceMetrics(target.resourceSummary)" :key="metric.label">
            <dt>{{ metric.label }}</dt>
            <dd>
              <span v-if="metric.width !== undefined" class="resource-meter" aria-hidden="true"><i :style="{ width: `${metric.width}%` }" /></span>
              <span>{{ metric.value }}</span>
            </dd>
          </div>
        </dl>
        <div class="resource-network">
          <div><Top aria-hidden="true" /><span>上行速率<strong>{{ riskNetworkMbps(usableSample(target.resourceSummary)?.networkTransmitBytesPerSecond) }}</strong></span></div>
          <div><Bottom aria-hidden="true" /><span>下行速率<strong>{{ riskNetworkMbps(usableSample(target.resourceSummary)?.networkReceiveBytesPerSecond) }}</strong></span></div>
        </div>
        <small v-if="target.resourceSummary?.sampledTime">采样 {{ riskTime(target.resourceSummary.sampledTime) }}</small>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.resource-summary { display:flex; flex-direction:column; overflow:hidden; } .resource-summary h2 { flex-shrink:0; } .resource-targets { min-height:0; overflow:auto; list-style:none; padding:0; margin:0; } .resource-targets li { padding:3px 0 6px; border-bottom:1px solid #14608466; } .resource-heading { display:flex; align-items:center; gap:7px; color:#b9d7e6; font-size:12px; } .resource-heading strong { color:#e8f7ff; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .resource-heading span:last-child { margin-left:auto; white-space:nowrap; color:#42e3c1; } .resource-heading span.warning { color:#ffd37d; } dl { display:grid; gap:4px; margin:6px 0 4px; font-size:12px; } dl div { display:grid; grid-template-columns:3em minmax(0,1fr); gap:4px; } dt, small, .resource-empty { color:#a8c9de; } dd { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin:0; color:#e8f7ff; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; } .resource-meter { flex:1 0 30px; height:6px; border-radius:3px; background:#0c4566; } .resource-meter i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#0c9fdf,#5cf4f6); } small { font-size:10px; }
.resource-heading { padding:6px 8px; border-bottom:1px solid #236b8e70; background:#06446a55; }
.resource-heading span:last-child { border-radius:999px; border:1px solid currentColor; padding:1px 7px; }
.resource-network { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:8px 0 4px; }
.resource-network > div { display:flex; align-items:center; gap:7px; min-width:0; padding:5px 8px; border:1px solid #236b8e; border-radius:6px; background:#052b48aa; }
.resource-network span { font-size:11px; color:#a8c9de; }
.resource-network svg,.resource-network strong { color:#39e7f2; }
.resource-network strong { display:block; font-size:clamp(12px,1.1vw,19px); font-variant-numeric:tabular-nums; }
</style>
