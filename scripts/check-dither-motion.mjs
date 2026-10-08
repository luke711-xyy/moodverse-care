import assert from 'node:assert/strict'

const target = process.argv[2]
assert.ok(target, 'Pass an owned local Vite gallery tab ID')
const js = `(async()=>{
 if(location.hostname!=='localhost'||location.port!=='5178')throw Error('Owned local Vite preview only');
 const {createDitherRenderer}=await import('/src/music/dither/renderer.ts');
 const {createDitherSpec,DITHER_FORMS,DITHER_MOTIFS}=await import('/src/music/dither/appearance.ts');
 const {createDitherMotion,createDitherCellField,stepParticleField}=await import('/src/music/dither/motion.ts');
 const {hitTestDitherAssets,sampleDitherAssetAlpha}=await import('/src/music/dither/layout.ts');
 const canvas=document.createElement('canvas'),renderer=createDitherRenderer(canvas),gl=canvas.getContext('webgl2');
 const spec=createDitherSpec({planetId:'particle-qa',tracks:[],overrides:{form:'organic',motif:'flow',size:1,pointer:'strong',pixelSize:3,pulse:.6}});
 const asset={id:'planet',spec,x:210,y:210,radius:185,phase:0};
 const read=frame=>{renderer.draw(frame);const data=new Uint8Array(420*420*4);gl.readPixels(0,0,420,420,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
 const empty=read({width:420,height:420,phase:0,assets:[{...asset,particles:{count:0,points:new Float32Array()}}]});
 const emptyPixels=empty.filter((v,i)=>i%4===3&&v>0).length;
 const motion=createDitherMotion(),frame={width:420,height:420,phase:0,assets:[{...asset}]};
 motion.apply(frame,0,0,false,false);const original=read(frame),cloud=frame.assets[0].particles;
 const baseline=read({...frame,assets:[asset]});let idleMismatch=0;
 for(let i=0;i<original.length;i+=4)if(Math.max(...[0,1,2,3].map(c=>Math.abs(original[i+c]-baseline[i+c])))>3)idleMismatch++;
 // Leave only one point, physically moved from the center to outside the body.
 const shifted={...asset,particles:{count:1,points:new Float32Array([1.1,0,0,0,6,1])}};
 const shiftedImage=read({...frame,assets:[shifted]});
 const centerAlpha=shiftedImage[((419-210)*420+210)*4+3];
 const exposedAlpha=shiftedImage[((419-210)*420+413)*4+3];
 let maxRestMismatch=0,parityCases=0,maxPickingError=0,hitMismatches=0;
 for(const form of DITHER_FORMS)for(const motif of DITHER_MOTIFS){
  const s=createDitherSpec({planetId:'texture-parity',tracks:[],overrides:{form,motif,size:1,pointer:'off',pixelSize:5,pulse:0}});
  const a={...asset,spec:s,phase:.8,rotation:.7};const f={...frame,assets:[a]};
  const before=read(f);createDitherMotion().apply(f,0,0,false,false);const after=read(f);let diff=0;
  for(let i=0;i<after.length;i+=4)if(Math.max(...[0,1,2,3].map(c=>Math.abs(after[i+c]-before[i+c])))>3)diff++;
  maxRestMismatch=Math.max(maxRestMismatch,diff);parityCases++;
 }
 let changed=0;frame.pointer={x:275,y:205};
 for(let i=0;i<70;i++)motion.apply(frame,1/60,i/60,true,false);
 const stirred=read(frame);for(let i=0;i<original.length;i+=4)if(original[i+3]!==stirred[i+3])changed++;
 for(let y=30;y<390;y+=13)for(let x=30;x<390;x+=13){const alpha=stirred[((419-y)*420+x)*4+3],cpu=sampleDitherAssetAlpha(frame.assets[0],x,y);maxPickingError=Math.max(maxPickingError,Math.abs(alpha-cpu));if((alpha>90)!==!!hitTestDitherAssets(frame.assets,x,y))hitMismatches++;}
 const displaced=Array.from(cloud.points).filter((n,i)=>i%6===0&&Math.abs(n-cloud.points[i+2])>.005).length;
 const rear={id:'rear',spec,x:210,y:210,radius:18,depth:-100};
 const only=read({...frame,pointer:undefined,assets:[frame.assets[0]]}),both=read({...frame,pointer:undefined,assets:[rear,frame.assets[0]]});
 let rearDiff=0;for(let y=195;y<225;y++)for(let x=195;x<225;x++){const i=((419-y)*420+x)*4;if(only[i]!==both[i]||only[i+3]!==both[i+3])rearDiff++;}
 const maskSpec=createDitherSpec({planetId:'occlusion',tracks:[],overrides:{form:'organic',size:1,pixelSize:3,pulse:0,pointer:'off'}});
 const mask={id:'mask',spec:maskSpec,x:180,y:180,radius:180,particles:{count:0,grid:122/2.4,points:new Float32Array()}};
 const edgeRear={...rear,spec:maskSpec,x:145,y:14,radius:5};
 const masked=read({...frame,pointer:undefined,assets:[edgeRear,mask]});
 const cappedMaskAlpha=masked[((419-14)*420+145)*4+3];
 const cappedMaskHit=hitTestDitherAssets([edgeRear,mask],145,14)?.id??null;
 const fadeMask={...mask,x:210,y:210,opacity:.25};
 const fadeImage=read({...frame,pointer:undefined,assets:[rear,fadeMask]});
 const fadedMaskAlpha=fadeImage[((419-210)*420+210)*4+3];
 const fadedMaskHit=hitTestDitherAssets([rear,fadeMask],210,210)?.id??null;
 const bg=createDitherMotion(),bframe={width:420,height:420,phase:0,assets:[],ambience:1};
 bg.apply(bframe,0,0,false,false);const bg0=read(bframe);
 bg.apply(bframe,.05,2,true,false);const bg2=read(bframe);
 bframe.pointer={x:235,y:200};for(let i=0;i<60;i++)bg.apply(bframe,1/60,2,true,false);const bgMouse=read(bframe);
 let backdropTimeChanges=0,backdropMouseChanges=0;
 for(let i=0;i<bg0.length;i+=4){if(bg0[i]!==bg2[i]||bg0[i+3]!==bg2[i+3])backdropTimeChanges++;if(bg2[i]!==bgMouse[i]||bg2[i+3]!==bgMouse[i+3])backdropMouseChanges++;}
 // Compare same phase/time: isolate the physical tide from body rotation.
 const tide=createDitherCellField(25),quiet=createDitherCellField(25),pose={spec,phase:.4,rotation:0,radius:185};
 for(let i=0;i<75;i++){stepParticleField(tide,pose,1/60,i/60,undefined,true);stepParticleField(quiet,{...pose,spec:{...spec,overrides:{...spec.overrides,pulse:0}}},1/60,i/60,undefined,true);}
 let tideMoved=0;for(let i=0;i<tide.count;i++)if(Math.hypot(tide.offsets[i*2],tide.offsets[i*2+1])>.001)tideMoved++;
 const bodyPixels=original.filter((v,i)=>i%4===3&&v>90).length;
 const result={maxRestMismatch,parityCases,maxPickingError,hitMismatches,idleMismatch,emptyPixels,centerAlpha,exposedAlpha,bodyPixels,changed,displaced,particles:cloud.count,rearDiff,cappedMaskAlpha,cappedMaskHit,fadedMaskAlpha,fadedMaskHit,backdropTimeChanges,backdropMouseChanges,tideMoved,tideTotal:tide.count,error:gl.getError(),centerHit:hitTestDitherAssets([shifted],210,210)?.id??null};
 // Frozen diagnostic snapshots only; these are not production backgrounds.
 const sheet=document.createElement('div');sheet.id='motion-qa';sheet.style.cssText='position:fixed;inset:0;background:#08080d;z-index:1000;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;color:white;font:14px monospace';
 for(const [pixels,label]of [[original,'Original dither cells at rest'],[stirred,'Same material cells: cursor + tide'],[bgMouse,'Live Galaxy field snapshot']]){const c=document.createElement('canvas');c.width=420;c.height=420;const ctx=c.getContext('2d'),im=ctx.createImageData(420,420);for(let y=0;y<420;y++)im.data.set(pixels.subarray((419-y)*420*4,(420-y)*420*4),y*420*4);ctx.putImageData(im,0,0);const figure=document.createElement('figure');figure.style.margin='8px';const caption=document.createElement('figcaption');caption.textContent=label;figure.append(c,caption);sheet.append(figure);}
 document.querySelector('#motion-qa')?.remove();document.body.append(sheet);renderer.dispose();return result;
})()`
const response = await fetch(`http://127.0.0.1:3456/eval?target=${encodeURIComponent(target)}`, { method: 'POST', body: js })
const result = await response.json()
assert.ok(result.value, JSON.stringify(result))
console.log(JSON.stringify(result.value))
const s = result.value
assert.equal(s.error, 0)
assert.ok(s.idleMismatch < 100, 'Undisturbed movable material cells must retain the original dither texture, not become a point cloud')
assert.equal(s.parityCases,28)
assert.ok(s.maxRestMismatch < 100, 'Every existing form/motif must preserve its original material after rotation')
assert.ok(s.maxPickingError <= 2, 'CPU picking must sample the material at the actually displayed cells')
assert.equal(s.hitMismatches,0)
assert.equal(s.emptyPixels, 0, 'No points must mean no visible sphere underlay')
assert.equal(s.centerAlpha, 0, 'Moving the sole body particle away must vacate its old region')
assert.ok(s.exposedAlpha > 90, 'The original material particle must be visible at its new position')
assert.equal(s.centerHit, null)
assert.ok(s.bodyPixels > 30000, 'The original material must be carried by a dense body, not a sparse decorative shell')
assert.ok(s.changed > 2500, 'Particle positions/coverage must really change')
assert.ok(s.displaced > 250, 'The body population, not a few sparse overlay points, must move')
assert.equal(s.rearDiff, 0, 'Rear satellites must remain occluded without visible solid underlay')
assert.equal(s.cappedMaskAlpha,0)
assert.equal(s.cappedMaskHit,null, 'Capped-grid mask picking must match GPU depth occlusion')
assert.equal(s.fadedMaskAlpha,0)
assert.equal(s.fadedMaskHit,null, 'Fading cells must not expose rear satellites to clicks')
assert.ok(s.backdropTimeChanges > 1000, 'Galaxy field must evolve over time')
assert.ok(s.backdropMouseChanges > 1000, 'Mouse must stir the procedural Galaxy field')
assert.ok(s.tideMoved > s.tideTotal * .95, 'The entire particle population must take part in the tide')
console.log('Particle-body and real-time Galaxy GPU checks passed')
