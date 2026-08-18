const DEFAULT_PARAMS = {
  mouseRadius: 0.22,
  mouseStrength: 1.1,
  decay: 0.96,
  distortBoost: 1.35,
  noiseBoost: 0,
  swirlBoost: 0.45,
  speed: 14,
  distortion: 20,
  swirl: 12,
  swirlIterations: 8,
  scale: 0.5,
  rotation: -5,
  proportion: 50,
  softness: 100,
  shapeScale: 10,
  offsetX: 0,
  offsetY: 65,
  color1: '#8AA3D6',
  color2: '#FFFFFF',
  color3: '#FFFFFF',
}

const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
out vec2 vUv;
void main() { vUv = a_position.xy * 0.5 + 0.5; gl_Position = a_position; }`

const FLOW_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D u_prev;
uniform vec2 u_mouse, u_velocity;
uniform float u_brushRadius, u_brushStrength, u_decay;
out vec4 fragColor;
void main() {
  vec4 prev = texture(u_prev, vUv);
  prev.r *= u_decay;
  prev.gb = mix(vec2(0.5), prev.gb, u_decay);
  float dist = distance(vUv, u_mouse);
  float influence = max(0.0, exp(-dist * dist / (u_brushRadius * u_brushRadius * 0.5)) - 0.01);
  float speed = length(u_velocity);
  float totalStrength = u_brushStrength * 0.3 + min(speed * 3.0, 0.7) * u_brushStrength;
  prev.r = max(prev.r, influence * totalStrength);
  float blendAmt = influence * min(totalStrength, 0.4) * 0.3;
  prev.g = mix(prev.g, clamp(u_velocity.x * 2.0 + 0.5, 0.0, 1.0), blendAmt);
  prev.b = mix(prev.b, clamp(u_velocity.y * 2.0 + 0.5, 0.0, 1.0), blendAmt);
  fragColor = prev;
}`

const COLOR_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform float u_time, u_pixelRatio, u_scale, u_rotation, u_colorCount, u_proportion, u_softness, u_shapeScale, u_distortion, u_swirl, u_swirlIterations, u_distortBoost, u_noiseBoost, u_swirlBoost;
uniform vec2 u_resolution, u_offset;
uniform vec4 u_color1, u_color2, u_color3;
uniform sampler2D u_flowmap;
out vec4 fragColor;
#define TWO_PI 6.28318530718
vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
float noise(vec2 st) {
  vec2 i = floor(st), f = fract(st), u = f*f*(3.0-2.0*f);
  return mix(mix(random(i), random(i + vec2(1,0)), u.x), mix(random(i + vec2(0,1)), random(i + vec2(1,1)), u.x), u.y);
}
vec3 blend_multi(float mixer, float softness) {
  float edge = 1.0 - softness;
  vec3 col = u_color1.rgb;
  if (u_colorCount > 1.5) col = mix(col, u_color2.rgb, smoothstep(0.0 + 0.35*edge, 0.7 - 0.35*edge, mixer));
  if (u_colorCount > 2.5) col = mix(col, u_color3.rgb, smoothstep(0.3 + 0.35*edge, 1.0 - 0.35*edge, mixer));
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = 0.5 * u_time;
  float ns = 0.0005 + 0.006 * u_scale;
  uv -= 0.5; uv *= ns * u_resolution; uv = rotate(uv, u_rotation * 0.5 * 3.14159265359);
  uv /= u_pixelRatio; uv += 0.5; uv += u_offset;
  vec4 flow = texture(u_flowmap, gl_FragCoord.xy / u_resolution.xy);
  float influence = flow.r;
  vec2 flowDir = (flow.gb - 0.5) * 2.0;
  float n1 = noise(uv + t), n2 = noise(uv * 2.0 - t), angle = n1 * TWO_PI;
  float totalDistortion = u_distortion + influence * u_distortBoost;
  uv += 4.0 * totalDistortion * n2 * vec2(cos(angle), sin(angle));
  uv += flowDir * influence * 0.15;
  if (influence > 0.001) {
    float localNoise = noise(uv * 2.0 + t * 1.5);
    uv += influence * u_noiseBoost * vec2(cos(localNoise * TWO_PI), sin(localNoise * TWO_PI));
  }
  float iters = ceil(clamp(u_swirlIterations, 1.0, 30.0));
  float swirlAmt = clamp(u_swirl, 0.0, 2.0) + influence * u_swirlBoost;
  for (float i = 1.0; i <= 30.0; i++) {
    if (i > iters) break;
    uv.x += swirlAmt / i * cos(t + i * 1.5 * uv.y);
    uv.y += swirlAmt / i * cos(t + i * uv.x);
  }
  float proportion = clamp(u_proportion, 0.0, 1.0);
  vec2 cuv = uv * (0.5 + 3.5 * u_shapeScale);
  float shape = 0.5 + 0.5 * sin(cuv.x) * cos(cuv.y);
  float mixer = shape + 0.48 * sign(proportion - 0.5) * pow(abs(proportion - 0.5), 0.5);
  fragColor = vec4(blend_multi(mixer, clamp(u_softness, 0.0, 1.0)), 1.0);
}`

function shader(gl, type, source) {
  const result = gl.createShader(type)
  if (!result) return null
  gl.shaderSource(result, source)
  gl.compileShader(result)
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    console.error('Background shader:', gl.getShaderInfoLog(result))
    gl.deleteShader(result)
    return null
  }
  return result
}

function program(gl, fragmentSource) {
  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertex || !fragment) return null
  const result = gl.createProgram()
  if (!result) return null
  gl.attachShader(result, vertex)
  gl.attachShader(result, fragment)
  gl.linkProgram(result)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    console.error('Background program:', gl.getProgramInfoLog(result))
    gl.deleteProgram(result)
    return null
  }
  return result
}

function flowBuffer(gl, width, height, data) {
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  if (!texture || !framebuffer) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { framebuffer, texture }
}

function colorValue(value) {
  const hex = value.replace('#', '')
  return [Number.parseInt(hex.slice(0, 2), 16) / 255, Number.parseInt(hex.slice(2, 4), 16) / 255, Number.parseInt(hex.slice(4, 6), 16) / 255]
}

export function mountBackground(canvas, overrides = {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' })
  if (!gl) return () => {}
  const params = { ...DEFAULT_PARAMS, ...overrides }
  const flowProgram = program(gl, FLOW_SHADER)
  const colorProgram = program(gl, COLOR_SHADER)
  const buffer = gl.createBuffer()
  if (!flowProgram || !colorProgram || !buffer) return () => {}
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const setPosition = (target) => {
    const location = gl.getAttribLocation(target, 'a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
  let width = Math.max(1, Math.round(canvas.clientWidth * ratio))
  let height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  const flowWidth = Math.max(1, Math.round(width / 4))
  const flowHeight = Math.max(1, Math.round(height / 4))
  const data = new Uint8Array(flowWidth * flowHeight * 4)
  for (let index = 0; index < flowWidth * flowHeight; index += 1) {
    data[index * 4 + 1] = 128
    data[index * 4 + 2] = 128
    data[index * 4 + 3] = 255
  }
  let first = flowBuffer(gl, flowWidth, flowHeight, data)
  let second = flowBuffer(gl, flowWidth, flowHeight, data)
  if (!first || !second) return () => {}
  const flow = ['prev', 'mouse', 'velocity', 'brushRadius', 'brushStrength', 'decay'].reduce((out, name) => {
    out[name] = gl.getUniformLocation(flowProgram, `u_${name}`)
    return out
  }, {})
  const names = ['time', 'pixelRatio', 'resolution', 'scale', 'rotation', 'offset', 'color1', 'color2', 'color3', 'colorCount', 'proportion', 'softness', 'shapeScale', 'distortion', 'swirl', 'swirlIterations', 'flowmap', 'distortBoost', 'noiseBoost', 'swirlBoost']
  const color = names.reduce((out, name) => {
    out[name] = gl.getUniformLocation(colorProgram, `u_${name}`)
    return out
  }, {})
  const pointer = { x: 0.5, y: 0.5, smoothX: 0.5, smoothY: 0.5, svx: 0, svy: 0 }
  const updatePointer = (event) => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = (event.clientX - rect.left) / rect.width
    pointer.y = 1 - (event.clientY - rect.top) / rect.height
  }
  const canHover = !window.matchMedia('(hover: none), (pointer: coarse)').matches
  if (canHover) window.addEventListener('mousemove', updatePointer)
  let frame = 0
  let lastFrame = 0
  const start = performance.now()
  const render = (now) => {
    frame = requestAnimationFrame(render)
    if (now - lastFrame < 1000 / 30) return
    lastFrame = now - ((now - lastFrame) % (1000 / 30))
    const currentRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth * currentRatio))
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight * currentRatio))
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth
      height = nextHeight
      canvas.width = width
      canvas.height = height
    }
    pointer.smoothX += (pointer.x - pointer.smoothX) * 0.12
    pointer.smoothY += (pointer.y - pointer.smoothY) * 0.12
    pointer.svx += ((pointer.x - pointer.smoothX) * 0.5 - pointer.svx) * 0.15
    pointer.svy += ((pointer.y - pointer.smoothY) * 0.5 - pointer.svy) * 0.15
    gl.bindFramebuffer(gl.FRAMEBUFFER, second.framebuffer)
    gl.viewport(0, 0, flowWidth, flowHeight)
    gl.useProgram(flowProgram)
    setPosition(flowProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, first.texture)
    gl.uniform1i(flow.prev, 0)
    gl.uniform2f(flow.mouse, pointer.smoothX, pointer.smoothY)
    gl.uniform2f(flow.velocity, pointer.svx, pointer.svy)
    gl.uniform1f(flow.brushRadius, params.mouseRadius)
    gl.uniform1f(flow.brushStrength, params.mouseStrength)
    gl.uniform1f(flow.decay, params.decay)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    ;[first, second] = [second, first]
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, width, height)
    gl.useProgram(colorProgram)
    setPosition(colorProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, first.texture)
    gl.uniform1i(color.flowmap, 0)
    gl.uniform1f(color.time, (now - start) * 0.001 * (params.speed / 100))
    gl.uniform1f(color.pixelRatio, currentRatio)
    gl.uniform2f(color.resolution, width, height)
    gl.uniform1f(color.scale, params.scale)
    gl.uniform1f(color.rotation, params.rotation / 90)
    gl.uniform2f(color.offset, params.offsetX / 100, params.offsetY / 100)
    const colors = [colorValue(params.color1), colorValue(params.color2), colorValue(params.color3)]
    ;[color.color1, color.color2, color.color3].forEach((location, index) => gl.uniform4f(location, ...colors[index], 1))
    gl.uniform1f(color.colorCount, 3)
    gl.uniform1f(color.proportion, params.proportion / 100)
    gl.uniform1f(color.softness, params.softness / 100)
    gl.uniform1f(color.shapeScale, params.shapeScale / 100)
    gl.uniform1f(color.distortion, params.distortion / 100)
    gl.uniform1f(color.swirl, params.swirl / 50)
    gl.uniform1f(color.swirlIterations, params.swirlIterations)
    gl.uniform1f(color.distortBoost, params.distortBoost)
    gl.uniform1f(color.noiseBoost, params.noiseBoost)
    gl.uniform1f(color.swirlBoost, params.swirlBoost)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  canvas.width = width
  canvas.height = height
  frame = requestAnimationFrame(render)
  return () => {
    cancelAnimationFrame(frame)
    if (canHover) window.removeEventListener('mousemove', updatePointer)
    gl.deleteFramebuffer(first.framebuffer)
    gl.deleteFramebuffer(second.framebuffer)
    gl.deleteTexture(first.texture)
    gl.deleteTexture(second.texture)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(flowProgram)
    gl.deleteProgram(colorProgram)
  }
}

