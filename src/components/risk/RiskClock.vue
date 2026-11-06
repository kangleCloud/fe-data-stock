<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { riskTime } from "@/utils/riskTime";

const emit = defineEmits<{ dayChange: [now: Date] }>();
const iso = ref(new Date().toISOString());
const text = ref(riskTime(iso.value));
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  const now = new Date();
  const nextIso = now.toISOString();
  const nextText = riskTime(nextIso);
  if (nextText.slice(0, 10) !== text.value.slice(0, 10)) emit("dayChange", now);
  iso.value = nextIso;
  text.value = nextText;
}

onMounted(() => {
  tick();
  timer = setInterval(tick, 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="access-clock"><span>北京时间</span><time :datetime="iso">{{ text }}</time></div>
</template>
