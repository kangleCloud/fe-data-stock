<script setup lang="ts">
import type { RiskResourceCurrent, RiskResourceGroup } from "@/types/riskMonitor";

defineProps<{ resources: RiskResourceCurrent[]; loading?: boolean; error?: string }>();
const groups: { key: RiskResourceGroup; label: string }[] = [
  { key: "cpu", label: "CPU" }, { key: "memory", label: "内存" },
  { key: "disk", label: "磁盘" }, { key: "networkRate", label: "网络速率" },
  { key: "load", label: "负载" }, { key: "uptime", label: "运行时间" },
];
const freshness = { FRESH: "新鲜", STALE: "已过期", UNAVAILABLE: "不可用" } as const;
const status = { SUCCEEDED: "采集成功", PARTIAL: "部分可用", FAILED: "采集失败" } as const;
const value = (input: string | null, unit: string) => input === null ? "—" : `${input} ${unit}`;
</script>

<template>
  <section aria-labelledby="risk-resource-title">
    <h2 id="risk-resource-title">资源状态</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading && !resources.length" role="status">正在加载资源状态…</p>
    <p v-else-if="!resources.length && !error">暂无资源样本</p>
    <article v-for="resource in resources" :key="resource.targetId" class="risk-resource-item">
      <h3>目标 {{ resource.targetId }}</h3>
      <p>{{ freshness[resource.freshness] }} · {{ resource.status ? status[resource.status] : '无采集结果' }} · 采集时间 {{ resource.sampledAt ?? '—' }}</p>
      <dl>
        <div><dt>CPU</dt><dd>{{ value(resource.cpuPercent, '%') }}</dd></div>
        <div><dt>内存已用 / 总量</dt><dd>{{ value(resource.memoryUsedBytes, '字节') }} / {{ value(resource.memoryTotalBytes, '字节') }}</dd></div>
        <div><dt>磁盘已用 / 总量</dt><dd>{{ value(resource.diskUsedBytes, '字节') }} / {{ value(resource.diskTotalBytes, '字节') }}</dd></div>
        <div><dt>网络接收 / 发送</dt><dd>{{ value(resource.networkReceiveBytesPerSecond, '字节/秒') }} / {{ value(resource.networkTransmitBytesPerSecond, '字节/秒') }}</dd></div>
        <div><dt>系统负载</dt><dd>{{ resource.load1 ?? '—' }}</dd></div>
        <div><dt>运行时间</dt><dd>{{ value(resource.uptimeSeconds, '秒') }}</dd></div>
      </dl>
      <ul v-if="Object.keys(resource.unavailableReasons).length" aria-label="资源不可用原因">
        <li v-for="group in groups.filter(item => resource.unavailableReasons[item.key])" :key="group.key">{{ group.label }}：{{ resource.unavailableReasons[group.key] }}</li>
      </ul>
    </article>
  </section>
</template>
