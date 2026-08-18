import { useEffect, useRef } from 'react'
import { mountBackground } from './background-core'

export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return mountBackground(canvas)
  }, [])

  return <canvas ref={canvasRef} className="background-canvas" aria-hidden="true" />
}

