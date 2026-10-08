import { DITHER_ALGORITHMS, DITHER_FORMS, DITHER_MOTIFS, effectiveDitherParameters, stableHash, type DitherPlanetSpec } from './appearance'
import { DITHER_FRAGMENT, DITHER_VERTEX } from './shaders'
import type { DitherAssetKind } from './sampler'

export type DitherAsset = { id: string; spec: DitherPlanetSpec; x: number; y: number; radius: number; depth?: number; opacity?: number; rotation?: number; phase?: number; kind?: DitherAssetKind }
export type DitherFrame = { width: number; height: number; phase: number; pointer?: { x: number; y: number }; assets: DitherAsset[] }

/** One renderer/context per scene, many two-dimensional assets per frame. */
export function createDitherRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
  if (!gl) throw new Error('DITHER_WEBGL_UNAVAILABLE')
  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, vao: WebGLVertexArrayObject | null = null
  const dispose = () => { shaders.forEach((shader) => gl.deleteShader(shader)); if (program) gl.deleteProgram(program); if (buffer) gl.deleteBuffer(buffer); if (vao) gl.deleteVertexArray(vao) }
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('DITHER_SHADER_ALLOCATION')
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`DITHER_SHADER_COMPILE: ${gl.getShaderInfoLog(shader)}`)
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, DITHER_VERTEX), fragment = compile(gl.FRAGMENT_SHADER, DITHER_FRAGMENT)
    program = gl.createProgram()
    if (!program) throw new Error('DITHER_PROGRAM_ALLOCATION')
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`DITHER_SHADER_LINK: ${gl.getProgramInfoLog(program)}`)
    buffer = gl.createBuffer(); vao = gl.createVertexArray()
    if (!buffer || !vao) throw new Error('DITHER_BUFFER_ALLOCATION')
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
    const attribute = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
    const uniforms = Object.fromEntries(['uViewport','uCenter','uRadius','uStyle','uField','uTone','uPalette','uPointer','uPhase','uSeed','uRotation','uGrid','uOpacity','uKind'].map((key) => [key, gl.getUniformLocation(program!, key)]))
    return {
      draw(frame: DitherFrame, dpr = 1) {
        if (gl.isContextLost()) return
        const width = Math.max(1, Math.round(frame.width * dpr)), height = Math.max(1, Math.round(frame.height * dpr))
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program); gl.bindVertexArray(vao); gl.enable(gl.BLEND)
        // RGB becomes premultiplied in the framebuffer; alpha must not be
        // squared. This matches browser composition, Canvas2D and CPU picking.
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.uniform2f(uniforms.uViewport, frame.width, frame.height)
        for (const asset of frame.assets) {
          if (asset.radius <= 0 || (asset.opacity ?? 1) <= 0) continue
          const p = effectiveDitherParameters(asset.spec), radius = asset.radius * p.size
          gl.uniform2f(uniforms.uCenter, asset.x, asset.y); gl.uniform1f(uniforms.uRadius, radius)
          gl.uniform4f(uniforms.uStyle, DITHER_FORMS.indexOf(p.form), DITHER_MOTIFS.indexOf(p.motif), DITHER_ALGORITHMS.indexOf(p.algorithm), frame.pointer ? p.pointer === 'strong' ? .15 : p.pointer === 'weak' ? .06 : 0 : 0)
          gl.uniform4f(uniforms.uField, p.textureScale, p.disturbance, p.density, p.pulse)
          gl.uniform4f(uniforms.uTone, p.exposure, p.contrast, p.gamma, p.glow)
          gl.uniform3f(uniforms.uPalette, p.blue, p.violet, p.pink)
          gl.uniform2f(uniforms.uPointer, frame.pointer ? (frame.pointer.x - asset.x) / radius : 10, frame.pointer ? (frame.pointer.y - asset.y) / radius : 10)
          gl.uniform1f(uniforms.uPhase, asset.phase ?? frame.phase); gl.uniform1f(uniforms.uSeed, stableHash(asset.spec.seed) % 65536 + p.seedOffset)
          gl.uniform1f(uniforms.uRotation, asset.rotation ?? 0); gl.uniform1f(uniforms.uGrid, radius / p.pixelSize)
          gl.uniform1f(uniforms.uOpacity, asset.opacity ?? 1); gl.uniform1i(uniforms.uKind, asset.kind === 'star' ? 1 : asset.kind === 'music' ? 2 : asset.kind === 'nebula' ? 3 : asset.kind === 'music-satellite' ? 4 : 0)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }
      },
      dispose,
    }
  } catch (error) { dispose(); throw error }
}
