import assert from 'node:assert/strict'

const target = process.argv[2]
if (!target) throw new Error('Pass the owned CDP preview target ID')
const response = await fetch(`http://127.0.0.1:3456/eval?target=${encodeURIComponent(target)}`, {
  method: 'POST', body: `(() => {
    const c = document.querySelector('[data-dither-renderer]');
    if (!c) return null;
    const rect = c.getBoundingClientRect(), gl = c.getContext('webgl2');
    return {mode:c.dataset.ditherRenderer,width:c.width,height:c.height,cssWidth:rect.width,cssHeight:rect.height,
      hidden:document.hidden,linked:gl ? !!gl.getParameter(gl.CURRENT_PROGRAM) : false,
      error:gl ? gl.getError() : null,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  })()`,
})
assert.equal(response.ok, true)
const result = await response.json()
assert.ok(result.value, JSON.stringify(result))
const state = result.value
assert.equal(state.mode, 'webgl2', JSON.stringify(state))
assert.equal(state.linked, true, 'Renderer must paint its initial frame even when opened in a background tab')
assert.ok(state.width >= Math.floor(state.cssWidth), 'Canvas must be initialized to the layout dimensions')
assert.equal(state.error, 0, 'Shader/draw pipeline must not emit a WebGL error')
assert.ok(state.scrollWidth <= state.viewport, 'Preview must not overflow horizontally')
console.log(JSON.stringify({ ok: true, ...state }))
