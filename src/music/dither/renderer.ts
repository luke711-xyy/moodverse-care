import { DITHER_ALGORITHMS, DITHER_FORMS, DITHER_MOTIFS, effectiveDitherParameters, stableHash, type DitherPlanetSpec } from './appearance'
import { DITHER_FRAGMENT, DITHER_VERTEX, DITHER_POINT_FRAGMENT, DITHER_POINT_VERTEX, DITHER_CELL_FRAGMENT, DITHER_CELL_VERTEX } from './shaders'
import type { DitherAssetKind } from './sampler'
import { MAX_DITHER_CELLS, PARTICLE_STRIDE, type ParticleCloud } from './motion'
import { loadAlbumTexture } from './album-texture'
import { IDENTITY_ORIENTATION, type Orientation } from './arcball'
import type { MeteorCloud } from './meteors'
import type { ObservationCamera } from './observation'

export type DitherAsset = { id: string; spec: DitherPlanetSpec; x: number; y: number; radius: number; depth?: number; opacity?: number; rotation?: number; orientation?: Orientation; phase?: number; kind?: DitherAssetKind; particles?: ParticleCloud; backgroundField?: boolean; backgroundView?: ObservationCamera; pointerPower?: number; pixelSize?: number; detail?: number }
export type DitherFrame = { width: number; height: number; phase: number; pointer?: { x: number; y: number }; assets: DitherAsset[]; meteors?: MeteorCloud; ambience?: number; observation?: ObservationCamera; background?: { stars: ParticleCloud; clouds: DitherAsset[]; opacity: number; pointer?: { x: number; y: number } } }

/** One context with shared quad, instanced material-cell and star programs. */
export function createDitherRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: true, depth: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
  if (!gl) throw new Error('DITHER_WEBGL_UNAVAILABLE')
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [], buffers: WebGLBuffer[] = [], vaos: WebGLVertexArrayObject[] = []
  const textures = new Map<string, WebGLTexture>()
  const dispose = () => { shaders.forEach(s => gl.deleteShader(s)); programs.forEach(p => gl.deleteProgram(p)); buffers.forEach(b => gl.deleteBuffer(b)); vaos.forEach(v => gl.deleteVertexArray(v)); textures.forEach(t => gl.deleteTexture(t)) }
  try {
    const albumTexture = (url?: string) => {
      const pixels = loadAlbumTexture(url)?.pixels
      const key = pixels && url ? url : ''
      let texture = textures.get(key)
      if (!texture) {
        texture = gl.createTexture() ?? undefined
        if (!texture) return false
        if (textures.size >= 64) { const first = [...textures.keys()].find(key => key !== '')!; gl.deleteTexture(textures.get(first)!); textures.delete(first) }
        textures.set(key, texture)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixels?.width ?? 1, pixels?.height ?? 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels ? new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength) : new Uint8Array([255, 255, 255, 255]))
      }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture)
      return Boolean(pixels)
    }
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
      const uniforms = Object.fromEntries(['uViewport','uCenter','uRadius','uStyle','uField','uTone','uPalette','uPointer','uPhase','uSeed','uRotation','uOrientation','uGrid','uOpacity','uKind','uPointScale','uMaskOnly','uDepth','uBackdrop','uAlbum','uHasAlbum','uDetail','uBackdropView'].map(key => [key, gl.getUniformLocation(program, key)]))
      return { program, buffer, vao, uniforms }
    }
    const body = pipeline(DITHER_VERTEX, DITHER_FRAGMENT, false), points = pipeline(DITHER_POINT_VERTEX, DITHER_POINT_FRAGMENT, true), cells = pipeline(DITHER_CELL_VERTEX, DITHER_CELL_FRAGMENT, true, true)
    const material = (pipe: typeof body, asset: DitherAsset, frame: DitherFrame, pointPass: boolean, depth = 0, mask = false) => {
      const p = effectiveDitherParameters(asset.spec), radius = asset.radius * p.size, u = pipe.uniforms
      gl.useProgram(pipe.program); gl.bindVertexArray(pipe.vao)
      const hasAlbum = albumTexture(asset.spec.coverTexture?.url)
      gl.uniform1i(u.uAlbum, 0); gl.uniform1f(u.uHasAlbum, hasAlbum ? 1 : 0)
      gl.uniform2f(u.uViewport, frame.width, frame.height); gl.uniform2f(u.uCenter, asset.x, asset.y); gl.uniform1f(u.uRadius, radius)
      const warp = !asset.particles && !asset.detail && !pointPass && frame.pointer ? p.pointer === 'strong' ? .15 : p.pointer === 'weak' ? .06 : 0 : 0
      gl.uniform4f(u.uStyle, DITHER_FORMS.indexOf(p.form), DITHER_MOTIFS.indexOf(p.motif), DITHER_ALGORITHMS.indexOf(p.algorithm), warp * (asset.pointerPower ?? 1))
      gl.uniform4f(u.uField, p.textureScale, p.disturbance, p.density, p.pulse); gl.uniform4f(u.uTone, p.exposure, p.contrast, p.gamma, p.glow)
      gl.uniform3f(u.uPalette, p.blue, p.violet, p.pink)
      gl.uniform2f(u.uPointer, frame.pointer ? (frame.pointer.x - asset.x) / radius : 10, frame.pointer ? (frame.pointer.y - asset.y) / radius : 10)
      gl.uniform1f(u.uPhase, asset.phase ?? frame.phase); gl.uniform1f(u.uSeed, stableHash(asset.spec.seed) % 65536 + p.seedOffset)
      gl.uniform1f(u.uRotation, asset.rotation ?? 0); gl.uniform1f(u.uGrid, asset.particles?.grid ?? radius / (asset.pixelSize ?? p.pixelSize))
      gl.uniform1f(u.uDetail, !pointPass && (asset.detail ?? 0)>0 ? 1 : 0)
      gl.uniform4f(u.uOrientation, ...(asset.orientation ?? IDENTITY_ORIENTATION))
      gl.uniform1f(u.uOpacity, asset.opacity ?? 1); gl.uniform1f(u.uMaskOnly, mask ? 1 : 0); gl.uniform1f(u.uDepth, depth)
      gl.uniform1f(u.uBackdrop, asset.backgroundField ? 1 : 0)
      gl.uniform3f(u.uBackdropView,(asset.backgroundView?.x ?? 0)/radius,(asset.backgroundView?.y ?? 0)/radius,asset.backgroundView?.zoom ?? 1)
      gl.uniform1i(u.uKind, asset.kind === 'star' ? 1 : asset.kind === 'music' ? 2 : asset.kind === 'nebula' ? 3 : asset.kind === 'music-satellite' ? 4 : 0)
    }
    const drawPoints = (cloud: ParticleCloud, dpr: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, points.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, cloud.points)
      gl.uniform1f(points.uniforms.uPointScale, dpr); gl.drawArrays(gl.POINTS, 0, cloud.count)
    }
    const drawSkyPoints = (cloud: ParticleCloud, opacity: number, frame: DitherFrame, dpr: number) => {
      if (!cloud.count) return
      gl.useProgram(points.program); gl.bindVertexArray(points.vao)
      const u = points.uniforms
      gl.uniform2f(u.uViewport, frame.width, frame.height); gl.uniform2f(u.uCenter, 0, 0); gl.uniform1f(u.uRadius, 1)
      gl.uniform1f(u.uDepth, 0); gl.uniform1f(u.uBackdrop, 0)
      gl.uniform1i(u.uKind, 5); gl.uniform1f(u.uOpacity, opacity)
      drawPoints(cloud, dpr)
    }
    const drawAsset = (asset: DitherAsset, frame: DitherFrame, dpr: number, depth = 0, mask = false) => {
      if (asset.radius <= 0 || (asset.opacity ?? 1) <= 0) return
      if (asset.particles) {
        const detail=asset.detail ?? 0
        material(cells, {...asset,opacity:(asset.opacity ?? 1)*(1-detail)}, frame, true, depth, mask)
        gl.bindBuffer(gl.ARRAY_BUFFER, cells.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, asset.particles.points)
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, asset.particles.count)
        if(detail>0){material(body,{...asset,particles:undefined,opacity:(asset.opacity ?? 1)*detail},frame,false,depth,mask);gl.drawArrays(gl.TRIANGLES,0,6)}
      }
      else { material(body, asset, frame, false, depth, mask); gl.drawArrays(gl.TRIANGLES, 0, 6) }
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
          drawSkyPoints(frame.background.stars, frame.background.opacity, frame, dpr)
        }
        if (frame.meteors) drawSkyPoints(frame.meteors, 1, frame, dpr)
        // Occlusion follows the same displaced cells as the visible surface.
        // A hover-created opening must not retain an invisible solid sphere.
        const depthAt = (index: number) => .8 - (index + 1) / (frame.assets.length + 1) * 1.6
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.colorMask(false, false, false, false)
        frame.assets.forEach((asset, index) => {
          if ((!asset.particles && !asset.detail) || asset.radius <= 0 || (asset.opacity ?? 1) < .25) return
          drawAsset(asset, frame, dpr, depthAt(index), true)
        })
        gl.colorMask(true, true, true, true); gl.depthMask(false)
        frame.assets.forEach((asset, index) => drawAsset(asset, frame, dpr, depthAt(index)))
        gl.disable(gl.DEPTH_TEST); gl.depthMask(true)
      },
      dispose,
    }
  } catch (error) { dispose(); throw error }
}
