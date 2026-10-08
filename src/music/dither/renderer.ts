import { DITHER_ALGORITHMS, DITHER_FORMS, DITHER_MOTIFS, effectiveDitherParameters, stableHash, type DitherPlanetSpec } from './appearance'
import { DITHER_FRAGMENT, DITHER_VERTEX, DITHER_POINT_FRAGMENT, DITHER_POINT_VERTEX, DITHER_CELL_FRAGMENT, DITHER_CELL_VERTEX } from './shaders'
import type { DitherAssetKind } from './sampler'
import { MAX_DITHER_CELLS, PARTICLE_STRIDE, type ParticleCloud } from './motion'

export type DitherAsset = { id: string; spec: DitherPlanetSpec; x: number; y: number; radius: number; depth?: number; opacity?: number; rotation?: number; phase?: number; kind?: DitherAssetKind; particles?: ParticleCloud; backgroundField?: boolean; pointerPower?: number }
export type DitherFrame = { width: number; height: number; phase: number; pointer?: { x: number; y: number }; assets: DitherAsset[]; ambience?: number; background?: { stars: ParticleCloud; clouds: DitherAsset[]; opacity: number; pointer?: { x: number; y: number } } }

/** One context with shared quad, instanced material-cell and star programs. */
export function createDitherRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: true, depth: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
  if (!gl) throw new Error('DITHER_WEBGL_UNAVAILABLE')
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [], buffers: WebGLBuffer[] = [], vaos: WebGLVertexArrayObject[] = []
  const dispose = () => { shaders.forEach(s => gl.deleteShader(s)); programs.forEach(p => gl.deleteProgram(p)); buffers.forEach(b => gl.deleteBuffer(b)); vaos.forEach(v => gl.deleteVertexArray(v)) }
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('DITHER_SHADER_ALLOCATION')
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`DITHER_SHADER_COMPILE: ${gl.getShaderInfoLog(shader)}`)
      return shader
    }
    const pipeline = (vertex: string, fragment: string, pointPass: boolean, cellPass = false) => {
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment), program = gl.createProgram()
      if (!program) throw new Error('DITHER_PROGRAM_ALLOCATION')
      programs.push(program); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`DITHER_SHADER_LINK: ${gl.getProgramInfoLog(program)}`)
      const buffer = gl.createBuffer(), vao = gl.createVertexArray()
      if (!buffer || !vao) throw new Error('DITHER_BUFFER_ALLOCATION')
      buffers.push(buffer); vaos.push(vao); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      if (pointPass) {
        gl.bufferData(gl.ARRAY_BUFFER, MAX_DITHER_CELLS * PARTICLE_STRIDE * 4, gl.DYNAMIC_DRAW)
        for (const [index, key] of ['aPosition', 'aHome', 'aLife'].entries()) {
          const attribute = gl.getAttribLocation(program, key)
          gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, PARTICLE_STRIDE * 4, index * 8)
          if (cellPass) gl.vertexAttribDivisor(attribute, 1)
        }
        if (cellPass) {
          const corners = gl.createBuffer()
          if (!corners) throw new Error('DITHER_BUFFER_ALLOCATION')
          buffers.push(corners); gl.bindBuffer(gl.ARRAY_BUFFER, corners)
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5,-.5, .5,-.5, -.5,.5, -.5,.5, .5,-.5, .5,.5]), gl.STATIC_DRAW)
          const attribute = gl.getAttribLocation(program, 'aCorner')
          gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
        }
      } else {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
        const attribute = gl.getAttribLocation(program, 'aPosition')
        gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
      }
      const uniforms = Object.fromEntries(['uViewport','uCenter','uRadius','uStyle','uField','uTone','uPalette','uPointer','uPhase','uSeed','uRotation','uGrid','uOpacity','uKind','uPointScale','uMaskOnly','uDepth','uBackdrop'].map(key => [key, gl.getUniformLocation(program, key)]))
      return { program, buffer, vao, uniforms }
    }
    const body = pipeline(DITHER_VERTEX, DITHER_FRAGMENT, false), points = pipeline(DITHER_POINT_VERTEX, DITHER_POINT_FRAGMENT, true), cells = pipeline(DITHER_CELL_VERTEX, DITHER_CELL_FRAGMENT, true, true)
    const material = (pipe: typeof body, asset: DitherAsset, frame: DitherFrame, pointPass: boolean, depth = 0, mask = false) => {
      const p = effectiveDitherParameters(asset.spec), radius = asset.radius * p.size, u = pipe.uniforms
      gl.useProgram(pipe.program); gl.bindVertexArray(pipe.vao)
      gl.uniform2f(u.uViewport, frame.width, frame.height); gl.uniform2f(u.uCenter, asset.x, asset.y); gl.uniform1f(u.uRadius, radius)
      const warp = !asset.particles && !pointPass && frame.pointer ? p.pointer === 'strong' ? .15 : p.pointer === 'weak' ? .06 : 0 : 0
      gl.uniform4f(u.uStyle, DITHER_FORMS.indexOf(p.form), DITHER_MOTIFS.indexOf(p.motif), DITHER_ALGORITHMS.indexOf(p.algorithm), warp * (asset.pointerPower ?? 1))
      gl.uniform4f(u.uField, p.textureScale, p.disturbance, p.density, p.pulse); gl.uniform4f(u.uTone, p.exposure, p.contrast, p.gamma, p.glow)
      gl.uniform3f(u.uPalette, p.blue, p.violet, p.pink)
      gl.uniform2f(u.uPointer, frame.pointer ? (frame.pointer.x - asset.x) / radius : 10, frame.pointer ? (frame.pointer.y - asset.y) / radius : 10)
      gl.uniform1f(u.uPhase, asset.phase ?? frame.phase); gl.uniform1f(u.uSeed, stableHash(asset.spec.seed) % 65536 + p.seedOffset)
      gl.uniform1f(u.uRotation, asset.rotation ?? 0); gl.uniform1f(u.uGrid, asset.particles?.grid ?? radius / p.pixelSize)
      gl.uniform1f(u.uOpacity, asset.opacity ?? 1); gl.uniform1f(u.uMaskOnly, mask ? 1 : 0); gl.uniform1f(u.uDepth, depth)
      gl.uniform1f(u.uBackdrop, asset.backgroundField ? 1 : 0)
      gl.uniform1i(u.uKind, asset.kind === 'star' ? 1 : asset.kind === 'music' ? 2 : asset.kind === 'nebula' ? 3 : asset.kind === 'music-satellite' ? 4 : 0)
    }
    const drawPoints = (cloud: ParticleCloud, dpr: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, points.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, cloud.points)
      gl.uniform1f(points.uniforms.uPointScale, dpr); gl.drawArrays(gl.POINTS, 0, cloud.count)
    }
    const drawAsset = (asset: DitherAsset, frame: DitherFrame, dpr: number, depth = 0) => {
      if (asset.radius <= 0 || (asset.opacity ?? 1) <= 0) return
      if (asset.particles) {
        material(cells, asset, frame, true, depth)
        gl.bindBuffer(gl.ARRAY_BUFFER, cells.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, asset.particles.points)
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, asset.particles.count)
      }
      else { material(body, asset, frame, false, depth); gl.drawArrays(gl.TRIANGLES, 0, 6) }
    }
    return {
      draw(frame: DitherFrame, dpr = 1) {
        if (gl.isContextLost()) return
        const width = Math.max(1, Math.round(frame.width * dpr)), height = Math.max(1, Math.round(frame.height * dpr))
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST)
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        if (frame.background) {
          frame.background.clouds.forEach(asset => drawAsset(asset, { ...frame, pointer: frame.background!.pointer }, dpr))
          gl.useProgram(points.program); gl.bindVertexArray(points.vao)
          const u = points.uniforms
          gl.uniform2f(u.uViewport, frame.width, frame.height); gl.uniform2f(u.uCenter, 0, 0); gl.uniform1f(u.uRadius, 1)
          gl.uniform1f(u.uDepth, 0)
          gl.uniform1i(u.uKind, 5); gl.uniform1f(u.uOpacity, frame.background.opacity)
          drawPoints(frame.background.stars, dpr)
        }
        // Invisible volumes write only depth, never color. The visible sphere
        // remains entirely movable points, but a far-side satellite cannot
        // shine through gaps in the cloud or receive an occluded click.
        const depthAt = (index: number) => .8 - (index + 1) / (frame.assets.length + 1) * 1.6
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.colorMask(false, false, false, false)
        frame.assets.forEach((asset, index) => {
          if (!asset.particles || asset.radius <= 0 || (asset.opacity ?? 1) < .25) return
          material(body, asset, frame, false, depthAt(index), true); gl.drawArrays(gl.TRIANGLES, 0, 6)
        })
        gl.colorMask(true, true, true, true); gl.depthMask(false)
        frame.assets.forEach((asset, index) => drawAsset(asset, frame, dpr, depthAt(index)))
        gl.disable(gl.DEPTH_TEST); gl.depthMask(true)
      },
      dispose,
    }
  } catch (error) { dispose(); throw error }
}
