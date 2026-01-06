<template>
  <MarkdownRender
    :content="content"
    :enable-mermaid="true"
    :is-dark="isDark"
  />
</template>

<script setup lang="ts">
import { MarkdownRender } from 'markstream-vue';
import { useThemeDetector } from '../../utils/themeDetector';

defineProps<{
  content: string;
}>();

const { isDark } = useThemeDetector();
</script>
