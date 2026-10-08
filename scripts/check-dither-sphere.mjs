import assert from 'node:assert/strict'

const target = process.argv[2]
assert.ok(target, 'Pass an owned local Vite gallery tab ID')
const js = `(async()=>{
 if(location.hostname!=='localhost'||location.port!=='5178')throw Error('Owned local Vite preview only');
 const {createDitherRenderer}=await import('/src/music/dither/renderer.ts');
 const {createDitherSpec,DITHER_FORMS,DITHER_MOTIFS}=await import('/src/music/dither/appearance.ts');
 const {renderDitherImage}=await import('/src/music/dither/sampler.ts');
 const {buildDitherStageFrame}=await import('/src/music/dither/stage-layout.ts');
 const {hitTestDitherAssets,sampleDitherAssetAlpha}=await import('/src/music/dither/layout.ts');
 const canvas=document.createElement('canvas'),renderer=createDitherRenderer(canvas),gl=canvas.getContext('webgl2');
 const spec=createDitherSpec({planetId:'sphere-qa',tracks:[],overrides:{form:'particles',motif:'flow',size:1,pointer:'off',pixelSize:2,exposure:1,contrast:1,gamma:1,blue:1,violet:0,pink:0}});
 const asset={id:'sphere',spec,x:150,y:150,radius:140};
 const read=(phase,kind='planet',rotation=0)=>{renderer.draw({width:300,height:300,phase,assets:[{...asset,kind,rotation}]});const data=new Uint8Array(300*300*4);gl.readPixels(0,0,300,300,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
 const first=read(0),turned=read(.8),quarter=read(Math.PI/2),flat=read(0,'nebula'),star=read(0,'star');
 const brightness=(pixels,side)=>{let sum=0;for(let x=.3;x<.55;x+=.03)for(let y=.3;y<.55;y+=.03){const px=Math.floor(150+side*x*140),py=299-Math.floor(150+side*y*140),i=(py*300+px)*4;sum+=pixels[i]+pixels[i+1]+pixels[i+2];}return sum;};
 let changed=0,flatDifference=0,silhouetteChanges=0;for(let i=0;i<first.length;i+=4){if(first[i+3]!==quarter[i+3])silhouetteChanges++;if(first[i+3]>240){if(first[i]!==turned[i]||first[i+1]!==turned[i+1])changed++;if(first[i]!==flat[i]||first[i+1]!==flat[i+1])flatDifference++;}}
 const lit=brightness(star,-1),shade=brightness(star,1),draggedStar=read(0,'star',.7);
 const draggedLit=brightness(draggedStar,-1),draggedShade=brightness(draggedStar,1);
 const error=gl.getError(),linked=!!gl.getParameter(gl.CURRENT_PROGRAM);
 const frame=buildDitherStageFrame({width:600,height:600,phase:0,owner:spec,systems:[],home:1,journey:0,rotation:0,friends:[],music:[{id:'right'},{id:'front'},{id:'left'},{id:'rear'}]});
 const owner=frame.assets.find(a=>a.id.startsWith('home:')),rear=frame.assets.find(a=>a.id==='music:rear'),front=frame.assets.find(a=>a.id==='music:front');
 const renderFrame=(assets)=>{renderer.draw({...frame,assets});const data=new Uint8Array(600*600*4);gl.readPixels(0,0,600,600,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
 const bodyOnly=renderFrame([owner]),composite=renderFrame(frame.assets);
 const diffAt=(asset)=>{let count=0;for(let dx=-8;dx<=8;dx++)for(let dy=-8;dy<=8;dy++){const i=((599-Math.floor(asset.y+dy))*600+Math.floor(asset.x+dx))*4;if(bodyOnly[i]!==composite[i]||bodyOnly[i+1]!==composite[i+1])count++;}return count;};
 const rearDifferences=diffAt(rear),frontDifferences=diffAt(front);
 const rearHit=hitTestDitherAssets(frame.assets,rear.x,rear.y)?.id,frontHit=hitTestDitherAssets(frame.assets,front.x,front.y)?.id;
 let maxAlphaError=0,hitMismatches=0;
 for(const phase of [0,.6,Math.PI/2,3,6]){const posed={...asset,phase,rotation:.7};renderer.draw({width:300,height:300,phase,assets:[posed]});const pixels=new Uint8Array(300*300*4);gl.readPixels(0,0,300,300,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let x=20;x<280;x+=11)for(let y=20;y<280;y+=11){const alpha=pixels[((299-y)*300+x)*4+3],cpu=sampleDitherAssetAlpha(posed,x,y);maxAlphaError=Math.max(maxAlphaError,Math.abs(alpha-cpu));if((alpha>90)!==!!hitTestDitherAssets([posed],x,y))hitMismatches++;}}
 // Single-context atlas for visual inspection of all existing form/motif pairs.
 const atlas=document.createElement('canvas'),ar=createDitherRenderer(atlas),assets=[];
 for(let row=0;row<DITHER_FORMS.length;row++)for(let col=0;col<DITHER_MOTIFS.length;col++)assets.push({id:row+':'+col,spec:createDitherSpec({planetId:'moodverse-art-system',tracks:[],overrides:{form:DITHER_FORMS[row],motif:DITHER_MOTIFS[col],size:1}}),x:col*180+90,y:row*180+90,radius:78});
 ar.draw({width:1260,height:720,phase:.4,assets});
 const copy=document.createElement('canvas');copy.width=1260;copy.height=720;copy.getContext('2d').drawImage(atlas,0,0);ar.dispose();
 let sheet=document.querySelector('#sphere-qa-atlas');sheet?.remove();sheet=document.createElement('div');sheet.id='sphere-qa-atlas';sheet.style.cssText='position:fixed;inset:0;z-index:99999;background:#08080d;display:grid;place-content:center;color:#f2eff8;font:14px monospace;';copy.style.cssText='max-width:100vw;max-height:85vh;width:auto;height:auto;';sheet.append(copy);const label=document.createElement('p');label.textContent='Rows: organic / particles / pulse / annulus · Columns: flow / score / flower / tide / digital / dust / prism';sheet.append(label);document.body.append(sheet);
 let cpuFilled=0;for(const form of DITHER_FORMS)for(const motif of DITHER_MOTIFS){const pixels=renderDitherImage(createDitherSpec({planetId:'qa',tracks:[],overrides:{form,motif}}),64);if(pixels.some((v,i)=>i%4===3&&v>240))cpuFilled++;}
 renderer.dispose();return {linked,error,changed,silhouetteChanges,flatDifference,lit,shade,draggedLit,draggedShade,rearDifferences,frontDifferences,rearHit,frontHit,maxAlphaError,hitMismatches,cpuFilled,assets:assets.length};
})()`
const response = await fetch(`http://127.0.0.1:3456/eval?target=${encodeURIComponent(target)}`, { method: 'POST', body: js })
const result = await response.json()
assert.ok(result.value, JSON.stringify(result))
const state = result.value
console.log(JSON.stringify({ inspection: state }))
assert.equal(state.linked, true)
assert.equal(state.error, 0)
assert.ok(state.changed > 5000, 'Sphere surface must turn, not remain a static shaded disc')
assert.ok(state.silhouetteChanges > 1000, 'The projected body shape must turn along with the material')
assert.ok(state.flatDifference > 5000, 'Spherical material must differ from the flat nebula')
assert.ok(state.lit > state.shade * 1.35, 'View-space lighting must produce a lit and dimmer hemisphere')
assert.ok(state.draggedLit > state.draggedShade * 1.35, 'Dragging must not rotate the light away from the lit hemisphere')
assert.equal(state.rearDifferences, 0, 'An opaque planet must fully cover the rear satellite at its projected center')
assert.ok(state.frontDifferences > 50, 'The front satellite must be visible over the planet')
assert.match(state.rearHit, /^home:/, 'An occluded satellite must not steal a planet click')
assert.equal(state.frontHit, 'music:front')
assert.ok(state.maxAlphaError <= 2, 'CPU picking must follow the rotating GPU silhouette at every tested phase')
assert.equal(state.hitMismatches, 0)
assert.equal(state.cpuFilled, 28, 'All form/motif combinations must retain CPU fallback content')
console.log(JSON.stringify({ ok: true, ...state }))
