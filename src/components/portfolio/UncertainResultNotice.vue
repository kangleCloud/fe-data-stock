<script setup lang="ts">
import type { EntityId } from "@/types/api";
defineProps<{
  checked: boolean;
  busy: boolean;
  rows: Array<{ id: EntityId; at: string; label: string; amount: string }>;
}>();
defineEmits<{ check: []; resume: [] }>();
</script>
<template>
  <section class="portfolio-preview">
    <el-alert
      title="结果未确认，已暂停再次提交"
      description="先读取流水核对是否已入账；确认未入账后，再明确重新录入。不会自动重发请求。"
      type="warning"
      :closable="false"
    />
    <el-button :loading="busy" @click="$emit('check')">读取流水核对</el-button>
    <el-button v-if="checked" :disabled="busy" @click="$emit('resume')">
      已核对未入账，重新预览
    </el-button>
    <el-table
      v-if="checked"
      :data="rows"
      empty-text="本次查询未找到流水，请结合日期与标的确认"
    >
      <el-table-column prop="id" label="记录ID" min-width="130" />
      <el-table-column prop="at" label="时间" min-width="150" />
      <el-table-column prop="label" label="记录" />
      <el-table-column
        prop="amount"
        label="金额 / 价格（元）"
        min-width="140"
      />
    </el-table>
  </section>
</template>
