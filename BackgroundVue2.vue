<script>
import { mountBackground } from './background-core'

export default {
  name: 'BackgroundVue2',
  data() {
    return { cleanup: () => {} }
  },
  mounted() {
    this.cleanup = mountBackground(this.$refs.canvas)
  },
  beforeDestroy() {
    this.cleanup()
  },
}
</script>

<template>
  <canvas ref="canvas" class="background-canvas" aria-hidden="true"></canvas>
</template>

