// Independent quad-based implementation; dither-hero (MIT) informed the field/
// threshold architecture. Analytic spheres add volume without 3D model assets.
export const DITHER_VERTEX = `#version 300 es
in vec2 aPosition;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uDepth;
out vec2 vAsset;
void main(){vAsset=aPosition*1.2;vec2 px=uCenter+vAsset*uRadius;
 gl_Position=vec4(px.x/uViewport.x*2.-1.,1.-px.y/uViewport.y*2.,uDepth,1.);}`

export const DITHER_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vAsset;
out vec4 fragColor;
uniform vec4 uStyle; // form, motif, threshold, pointer strength
uniform vec4 uField; // scale, warp, density, pulse
uniform vec4 uTone; // exposure, contrast, gamma, glow
uniform vec3 uPalette;
uniform vec2 uPointer;
uniform float uPhase;
uniform float uSeed;
uniform float uRotation;
uniform float uGrid;
uniform float uOpacity;
uniform float uMaskOnly;
uniform float uBackdrop;
uniform int uKind;
float hashAt(vec2 p,float seed){return fract(sin(dot(p,vec2(127.1,311.7))+seed*.013)*43758.5453);}
float hash(vec2 p){return hashAt(p,uSeed);}
float noiseAt(vec2 p,float seed){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hashAt(i,seed),hashAt(i+vec2(1,0),seed),f.x),mix(hashAt(i+vec2(0,1),seed),hashAt(i+vec2(1,1),seed),f.x),f.y);}
float noise(vec2 p){return noiseAt(p,uSeed);}
float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=noiseAt(p,uSeed+float(i)*17.)*a;p=p*2.02+vec2(3.4,4.1);a*=.5;}return n;}
float line(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));}
// Orthographic ellipsoid projection, with rim detail fixed in body coordinates.
float bodyRadius(float form,float angle,float phase,float pulse){
 float c=cos(phase),s=sin(phase),x=cos(angle),y=sin(angle);
 float zAxis=form<.5?.78:form<1.5?.88:form<2.5?.83:.9;
 float width=sqrt(c*c+zAxis*zAxis*s*s);
 float radius=(.85+sin(phase)*pulse*.035)/length(vec2(x/width,y));
 float rayA=s*s+c*c/(zAxis*zAxis),rayB=x*c*s*(1.-1./(zAxis*zAxis));
 float tangentZ=-rayB/rayA;vec3 body=vec3(x*c+tangentZ*s,y,(-x*s+tangentZ*c)/zAxis);
 float bodyAngle=atan(body.y,body.x),weight=length(body.xy)/length(body);
 if(form<.5)radius+=(.055*sin(bodyAngle*3.)+.035*cos(bodyAngle*7.))*weight;
 else if(form>1.5&&form<2.5)radius+=.04*cos(bodyAngle*8.)*weight;
 return radius;
}
// Match sphere.ts: view-space light, rotating surface-space texture, no seam.
vec4 sphereSurface(vec2 p,float radius,float phase){
 vec2 n=p/max(radius,length(p));float z=sqrt(max(0.,1.-dot(n,n)));
 float c=cos(phase),s=sin(phase),sx=n.x*c+z*s,sz=-n.x*s+z*c;
 float sy=n.y*cos(.22)-sz*sin(.22);
 vec2 lit=mat2(cos(uRotation),sin(uRotation),-sin(uRotation),cos(uRotation))*n;
 float diffuse=max(0.,dot(vec3(lit,z),vec3(-.46,-.48,.74)));
 float highlight=pow(max(0.,dot(vec3(lit,z),vec3(-.29,-.3,.91))),24.)*.2;
 float rim=pow(1.-z,3.)*.12;
 return vec4(asin(clamp(vec2(sx,sy),-1.,1.))*.62,.24+.85*diffuse,highlight+rim);
}
float threshold(vec2 p){
 if(uStyle.z>2.5)return hash(p);
 if(uStyle.z>1.5)return clamp(length(fract(vec2(p.x+p.y,p.x-p.y)/8.)-.5)*1.7,0.,1.);
 ivec2 c=ivec2(p);int rank=0;int levels=uStyle.z>.5?2:3;
 for(int i=0;i<3;i++){if(i>=levels)break;int x=(c.x>>i)&1,y=(c.y>>i)&1;
 int digit=y==0?(x==0?0:2):(x==0?3:1);rank=rank*4+digit;}
 return (float(rank)+.5)/(levels==2?16.:64.);
}
void main(){
 if(uBackdrop>0.){
  // Live domain-warped field. Time and a local pointer vortex affect the field
  // BEFORE tone quantization; the pixel grid itself stays crisp and stable.
  vec2 cells=floor((vAsset+1.2)*uGrid);
  vec2 p=(cells+.5)/uGrid-1.2;
  vec2 d=p-uPointer;
  float influence=exp(-dot(d,d)*8.)*uStyle.w;
  p+=(d+vec2(-d.y,d.x)*1.8)*influence*4.;
  float t=uPhase*.055;
  vec2 warp=vec2(fbm(p*1.3+vec2(t,-t*.7)),fbm(p*1.3+vec2(-t*.5,t*.8)+7.1))-.5;
  vec2 flow=p+warp*.95;
  float haze=fbm(flow*2.5+vec2(t*.4,-t*.6));
  float ribbon=pow(.5+.5*sin(flow.x*7.+flow.y*4.+haze*5.-t),3.);
  float tone=clamp(smoothstep(.3,.78,haze)*.57+ribbon*.22,0.,1.);
  float q=floor(tone*4.+threshold(cells))/4.;
  float hue=clamp(haze+.22*sin(flow.y*2.+t),0.,1.);
  vec3 color=mix(vec3(.424,.616,1.),vec3(.557,.42,1.),smoothstep(.15,.7,hue));
  color=mix(color,vec3(.949,.475,.773),smoothstep(.65,1.,hue)*.6);
  fragColor=vec4(color,q*.22*uOpacity);return;
 }
#ifdef DITHER_POINTS
 if(vPointOpacity<=0.)discard;
 // Discrete little pixel clusters, not smooth circular sprites or glow blobs.
 vec2 pointUV=gl_PointCoord-.5;
 if(dot(pointUV,pointUV)>.25)discard;
 if(uKind==5){
  float hue=vAsset.x;
  vec3 star=mix(vec3(.424,.616,1.),vec3(.949,.475,.773),hue);
  star=mix(star,vec3(.949,.937,.973),.64);
  float cell=mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y)*2.,4.);
  if(vPointSize>3.&&cell>2.)discard;
  fragColor=vec4(star,vPointOpacity*uOpacity);return;
 }
#endif
 vec2 coord=vAsset;
 if(uStyle.w>0.){vec2 delta=coord-uPointer;coord+=delta*exp(-dot(delta,delta)*6.)*uStyle.w;}
 float ct=cos(uRotation),st=sin(uRotation);coord=mat2(ct,-st,st,ct)*coord;
 vec2 cells=floor((coord+1.2)*uGrid);
 vec2 uv=(cells+.5)/uGrid-1.2;
 float screenR=length(uv),screenAngle=atan(uv.y,uv.x),t=uPhase;
 float radius=.85+sin(t)*uField.w*.035;
 if(uStyle.x<.5)radius+=.055*sin(screenAngle*3.+t)+.035*cos(screenAngle*7.-t*2.);
 else if(uStyle.x>1.5&&uStyle.x<2.5)radius+=.04*cos(screenAngle*8.-t);
 bool spherical=uKind==0||uKind==1||uKind==4;
 if(spherical)radius=bodyRadius(uStyle.x,screenAngle,t,uField.w);
 float alpha=1.-smoothstep(radius-.015,radius+.025,screenR);
 float halo=exp(-max(0.,screenR-radius)*22.)*uTone.w*.16;
 alpha=max(alpha,screenR<1.15?halo:0.);
#ifndef DITHER_CELLS
 if(uMaskOnly>0.){if(alpha<.36)discard;fragColor=vec4(0);return;}
#endif
 if(alpha<.008)discard;
 vec4 surface=spherical?sphereSurface(uv,radius,t):vec4(uv,1.,0.);
 vec2 textureUV=surface.xy;
 float r=length(textureUV),ang=atan(textureUV.y,textureUV.x);
 float warp=fbm(textureUV*3.+vec2(cos(t),sin(t))*.4)-.5;
 vec2 w=textureUV+warp*uField.y*vec2(.35,.25);
 float scale=2.+uField.x*6.,tone=.2;
 if(uStyle.y<.5){float n=fbm(w*scale+vec2(cos(t),sin(t)));tone=.18+.7*pow(.5+.5*sin((w.x*3.+w.y*.6+n*1.6)*8.+sin(t)),2.);}
 else if(uStyle.y<1.5){
  float ly=w.y+sin(w.x*3.+t)*.04;
  float staff=1.-smoothstep(.01,.025,abs(fract((ly+.5)*5.)-.5)/5.);
  float notes=0.;for(int i=0;i<7;i++){float nx=-.65+float(i)*.21,ny=(hash(vec2(i,0))-.5)*.6+sin(t+float(i))*.02;
   notes=max(notes,1.-smoothstep(.035,.06,length((w-vec2(nx,ny))*vec2(.8,1.3))));
   notes=max(notes,1.-smoothstep(.008,.022,line(w,vec2(nx+.035,ny),vec2(nx+.035,ny-.23))));}
  tone=.15+staff*.3+notes*.7;
 }else if(uStyle.y<2.5){
  float petal=(1.-smoothstep(.06,.19,abs(sin(ang*3.-r*3.3+sin(t)*.15))))*smoothstep(.12,.25,r)*(1.-smoothstep(.61,.75,r));
  float filament=(1.-smoothstep(.018,.05,abs(sin(ang*11.+r*3.))))*smoothstep(.2,.3,r)*(1.-smoothstep(.7,.83,r));
  float anthers=0.;for(int i=0;i<11;i++){float angle=float(i)*6.2831853/11.,len=.79-.025*sin(float(i));anthers=max(anthers,1.-smoothstep(.009,.023,length(textureUV-vec2(cos(angle),sin(angle))*len)));}
  tone=.13+petal*.7+filament*.65+anthers*.85+.3*(1.-smoothstep(0.,.13,r));
 }else if(uStyle.y<3.5){tone=.2+.55*pow(.5+.5*cos(r*(16.+scale)+warp*4.+sin(t)),3.);}
 else if(uStyle.y<4.5){tone=.15+.6*hash(floor(w*vec2(18,11)))*(.4+.6*(1.-smoothstep(.1,.3,abs(fract(w.y*11.)-.5))));}
 else if(uStyle.y<5.5){float star=step(1.-uField.z*.3,hash(floor(w*24.)));tone=.2+.6*fbm(w*4.+vec2(cos(t),sin(t)))+star*.3;}
 else {tone=.18+.55*abs(sin(ang*3.+r*scale*2.+sin(t)));}
 if(uStyle.x>.5&&uStyle.x<1.5)tone*=.18+.82*step(hash(floor(textureUV*65.)),uField.z);
 if(uStyle.x>1.5&&uStyle.x<2.5)tone+=.2*pow(max(0.,cos(ang*8.+t)),12.)*smoothstep(.25,.8,r);
 if(uStyle.x>2.5)tone=screenR<.29?.025:tone*.5+.4*(1.-smoothstep(.015,.06,abs(length(uv*vec2(1,1.4))-.6)));
 if(uKind==1)tone=.85-.3*screenR+.15*noise(textureUV*30.);
 if(uKind==2){tone=.2+.45*(.5+.5*cos(screenR*110.))+ .18*sin(screenAngle*2.+t);if(screenR<.16)tone=.03;}
 if(uKind==4){tone=.2+.45*(.5+.5*cos(r*70.))+ .18*sin(ang*2.+t);if(r<.16)tone=.03;}
 if(spherical)tone=(.22+.78*tone)*surface.z+surface.w;
 tone=clamp((pow(clamp(tone,0.,1.),uTone.z)-.5)*uTone.y+.5,0.,1.);
 tone=clamp(tone*uTone.x,0.,1.);
 float q=floor(tone*4.+threshold(cells))/4.;
 float hue=.5+.5*sin(ang+warp*3.+sin(t));
 vec3 weights=uPalette*vec3(.05+2.*pow(1.-hue,2.),.25+.5*(1.-abs(.5-hue)*2.),.05+2.*hue*hue);weights/=dot(weights,vec3(1));
 vec3 color=vec3(.424,.616,1.)*weights.x+vec3(.557,.42,1.)*weights.y+vec3(.949,.475,.773)*weights.z;
 color=mix(color,vec3(.949,.937,.973),max(0.,q-.9)*1.5);
 color=mix(vec3(.031,.031,.051),color,q);
#ifdef DITHER_CELLS
 alpha*=vPointOpacity;
#endif
 fragColor=vec4(color,clamp(alpha*uOpacity,0.,1.));
}`

export const DITHER_POINT_VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aHome;
in vec2 aLife;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uDepth;
uniform float uPointScale;
out vec2 vAsset;
out float vPointOpacity;
out float vPointSize;
void main(){
 vAsset=aHome;vPointOpacity=aLife.y;vPointSize=aLife.x;
 vec2 px=uCenter+aPosition*uRadius;
 gl_Position=vec4(px.x/uViewport.x*2.-1.,1.-px.y/uViewport.y*2.,uDepth,1.);
 gl_PointSize=aLife.x*uPointScale;
}`

// Share the same seven motifs, five-color lighting and thresholds as the body.
export const DITHER_POINT_FRAGMENT = DITHER_FRAGMENT.replace('in vec2 vAsset;', '#define DITHER_POINTS\nin float vPointOpacity;\nin float vPointSize;\nin vec2 vAsset;')

// Each instance IS one original dither cell: a square, not a round point sprite.
// Its material home samples the same shader; its displayed position may move.
export const DITHER_CELL_VERTEX = `#version 300 es
in vec2 aCorner;
in vec2 aPosition;
in vec2 aHome;
in vec2 aLife;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uRotation;
uniform float uDepth;
out vec2 vAsset;
out float vPointOpacity;
void main(){
 vAsset=aHome;vPointOpacity=aLife.y;
 float c=cos(uRotation),s=sin(uRotation);
 vec2 corner=mat2(c,s,-s,c)*aCorner*aLife.x;
 vec2 px=uCenter+aPosition*uRadius+corner;
 gl_Position=vec4(px.x/uViewport.x*2.-1.,1.-px.y/uViewport.y*2.,uDepth,1.);
}`
export const DITHER_CELL_FRAGMENT = DITHER_FRAGMENT.replace('in vec2 vAsset;', '#define DITHER_CELLS\nin float vPointOpacity;\nin vec2 vAsset;')
