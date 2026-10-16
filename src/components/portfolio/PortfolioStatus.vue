<script setup lang="ts">
import { statusNames } from "@/utils/portfolio";
defineProps<{ value?: string | null }>();
</script>
<template>
  <el-tag
    :type="
      ['VOID', 'NONE', 'MISSING', 'EMPTY', 'NO_HOLDING'].includes(value || '')
        ? 'info'
        : [
          'INCOMPLETE',
          'RECHECK',
          'UNVERIFIED',
          'PENDING',
          'ESTIMATED',
          'UNCONFIGURED',
        ].includes(value || '')
          ? 'warning'
          : 'success'
    "
    effect="plain"
  >
    {{ statusNames[value || ""] || value || "—" }}
  </el-tag>
</template>
