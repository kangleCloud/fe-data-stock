<script setup lang="ts">
import type { RiskResourceCurrent } from "@/types/riskMonitor";
import { riskTime } from "@/utils/riskTime";

defineProps<{ resources: RiskResourceCurrent[]; loading?: boolean; error?: string }>();
const freshness = { FRESH: "新鲜", STALE: "已过期", UNAVAILABLE: "不可用" } as const;
const status = { SUCCEEDED: "采集成功", PARTIAL: "部分可用", FAILED: "采集失败" } as const;
const value = (input: string | null, unit: string) => input === null ? "—" : `${input} ${unit}`;
function bytes(input: string | null, perSecond = false): string {
  if (input === null || !/^\d+$/.test(input)) return "—";
  const amount = BigInt(input); const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
  let divisor = 1n; let unit = 0;
  while (unit < units.length - 1 && amount >= divisor * 1024n) { divisor *= 1024n; unit++; }
  if (!unit) return `${amount} B${perSecond ? "/s" : ""}`;
  const scaled = amount * 100n / divisor;
  return `${amount * 100n % divisor ? "≈" : ""}${scaled / 100n}.${(scaled % 100n).toString().padStart(2, "0")} ${units[unit]}${perSecond ? "/s" : ""}`;
}
</script>

<template>
  <section class="page-panel risk-admin-panel" aria-labelledby="risk-resource-title">
    <div class="risk-admin-toolbar"><h2 id="risk-resource-title">资源状态</h2></div>
    <p v-if="error" class="risk-admin-alert is-error" role="alert">{{ error }}</p>
    <p v-if="loading && !resources.length" class="risk-admin-empty" role="status">正在加载资源状态…</p>
    <p v-else-if="!resources.length && !error" class="risk-admin-empty">暂无资源样本</p>
    <article v-for="resource in resources" :key="resource.targetId" class="risk-resource-item">
      <h3>目标 {{ resource.targetId }}</h3>
      <p>{{ freshness[resource.freshness] }} · {{ resource.status ? status[resource.status] : '无采集结果' }} · {{ riskTime(resource.sampledTime) }}</p>
      <dl>
        <div><dt>CPU</dt><dd>{{ value(resource.cpuPercent, '%') }}</dd></div>
        <div><dt>内存</dt><dd :title="`${resource.memoryUsedBytes ?? '—'} / ${resource.memoryTotalBytes ?? '—'} 字节`">{{ bytes(resource.memoryUsedBytes) }} / {{ bytes(resource.memoryTotalBytes) }}</dd></div>
        <div><dt>磁盘</dt><dd :title="`${resource.diskUsedBytes ?? '—'} / ${resource.diskTotalBytes ?? '—'} 字节`">{{ bytes(resource.diskUsedBytes) }} / {{ bytes(resource.diskTotalBytes) }}</dd></div>
        <div><dt>网络接收 / 发送</dt><dd>{{ bytes(resource.networkReceiveBytesPerSecond, true) }} / {{ bytes(resource.networkTransmitBytesPerSecond, true) }}</dd></div>
        <div><dt>系统负载</dt><dd>{{ resource.load1 ?? '—' }}</dd></div>
        <div><dt>运行时间</dt><dd>{{ value(resource.uptimeSeconds, '秒') }}</dd></div>
      </dl>
    </article>
  </section>
</template>
