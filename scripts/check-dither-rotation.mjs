import assert from 'node:assert/strict'
const target = process.argv[2]
assert.ok(target, 'Pass an owned local Vite tab ID')
const js = `(async()=>{
 if(location.hostname!=='localhost' || location.port!=='5178') throw Error('Owned local Vite preview only');
 const {createDitherRenderer}=await import('/src/music/dither/renderer.ts');
 const {createDitherSpec}=await import('/src/music/dither/appearance.ts');
 const {hitTestDitherAssets}=await import('/src/music/dither/layout.ts');
 const {cachedDitherCanvas}=await import('/src/music/dither/DitherCanvas.tsx');
 const spec=createDitherSpec({planetId:'layout',tracks:[],overrides:{form:'organic',size:1,pointer:'off',pixelSize:2}});
 const canvas=document.createElement('canvas');
 const renderer=createDitherRenderer(canvas),gl=canvas.getContext('webgl2');
 const asset={id:'rotated',spec,x:150,y:150,radius:100,rotation:.7};
 renderer.draw({width:300,height:300,phase:0,assets:[asset]});
 const probe=(x,y)=>{const px=150+100*x,py=150+100*y;let p=new Uint8Array(4);gl.readPixels(Math.floor(px),299-Math.floor(py),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return {x,y,gpuAlpha:p[3],hit:!!hitTestDitherAssets([asset],px,py)}};
 const probes=[probe(-.78,-.43),probe(-.4,.3),probe(1.1,1.1)];
 const coarse={...asset,spec:createDitherSpec({planetId:'layout',tracks:[],overrides:{form:'organic',size:1,pointer:'off'}})};
 renderer.draw({width:300,height:300,phase:0,assets:[coarse]});
 let cp=new Uint8Array(4);gl.readPixels(72,192,1,1,gl.RGBA,gl.UNSIGNED_BYTE,cp);
 const coarseProbe={gpuAlpha:cp[3],hit:!!hitTestDitherAssets([coarse],72,107)};
 const fallback=document.createElement('canvas');fallback.width=fallback.height=300;
 const ctx=fallback.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.translate(150,150);ctx.rotate(.7);
 ctx.drawImage(cachedDitherCanvas(coarse.spec,128),-120,-120,240,240);
 const fallbackProbes=[[72,107],[110,180],[260,260]].map(([x,y])=>({alpha:ctx.getImageData(x,y,1,1).data[3],hit:!!hitTestDitherAssets([coarse],x,y,{mode:'canvas2d'})}));
 renderer.dispose();return {probes,coarseProbe,fallbackProbes};
})()`
const response = await fetch(`http://127.0.0.1:3456/eval?target=${encodeURIComponent(target)}`, { method: 'POST', body: js })
const result = await response.json()
assert.ok(result.value, JSON.stringify(result))
const { probes, coarseProbe, fallbackProbes } = result.value
assert.equal(probes[0].hit, false)
assert.ok(probes[0].gpuAlpha < 90, 'Transparent rotated boundary must not be painted as opaque in WebGL')
assert.equal(probes[1].hit, true); assert.ok(probes[1].gpuAlpha > 90)
assert.equal(probes[2].hit, false); assert.equal(probes[2].gpuAlpha, 0)
assert.equal(coarseProbe.hit, true); assert.ok(coarseProbe.gpuAlpha > 90)
for (const probe of fallbackProbes) assert.equal(probe.hit, probe.alpha > 90, 'Fallback cell and pointer hit must agree')
console.log(JSON.stringify({ ok: true, ...result.value }))
