<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { mountBackground } from './background-core'

const canvas = ref(null)
let cleanup = () => {}

onMounted(() => {
  if (canvas.value) cleanup = mountBackground(canvas.value)
})

onBeforeUnmount(() => cleanup())
</script>

<template>
  <canvas ref="canvas" class="background-canvas" aria-hidden="true"></canvas>
</template>

