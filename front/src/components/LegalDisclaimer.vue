<template>
  <t-alert theme="warning" :close="false" class="legal-banner">
    <template #message>
      {{ text }}
    </template>
  </t-alert>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{ text?: string }>(),
  {
    text:
      '【模拟交易声明】本平台提供的是虚拟资金模拟体验，不涉及真实资金。AI情景展望为教育参考，不构成投资建议。市场有风险，投资需谨慎。',
  }
);
</script>

<style scoped>
.legal-banner {
  margin-bottom: 16px;
}
</style>
