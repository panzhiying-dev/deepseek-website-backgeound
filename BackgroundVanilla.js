import { mountBackground } from './background-core'

/** Mount the background into any DOM element and return its disposer. */
export function createBackground(container = document.body) {
  const canvas = document.createElement('canvas')
  canvas.className = 'background-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  container.appendChild(canvas)
  const disposeRenderer = mountBackground(canvas)

  return () => {
    disposeRenderer()
    canvas.remove()
  }
}

export default createBackground

