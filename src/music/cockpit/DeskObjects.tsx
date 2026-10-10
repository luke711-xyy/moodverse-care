import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

export type RadioPlayer = { playing: boolean; blocked: boolean; currentTrack?: { title: string; artistName: string; coverUrl?: string | null }; toggle: () => void; canSkip?: boolean; previous?: () => void; next?: () => void }

/** Lightweight, reusable 2.5D desk props. Their entire painted surface passes
 * through the opaque hardware dither; these ornaments never intercept input. */
export function RetroRadio({ player }: { player?: RadioPlayer }) {
  const label = player?.currentTrack ? `${player.currentTrack.title} · ${player.currentTrack.artistName}` : 'Cosmos · The_mountain'
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const cover = player?.currentTrack?.coverUrl
  const trackRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    let active = true
    const fit = () => {
      if (!active) return
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      for (const text of track.querySelectorAll<HTMLElement>('strong, span')) {
        // Reset before measuring so shorter songs and wider screens grow back.
        text.style.fontSize = ''
        const maximum = parseFloat(getComputedStyle(text).fontSize)
        if (!Number.isFinite(maximum) || !text.clientWidth) continue
        const minimum = Math.min(maximum, Math.max(rem * .1875, maximum * .72))
        const fits = () => text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= Math.min(text.clientHeight, parseFloat(getComputedStyle(text).lineHeight) * 2) + 1
        if (fits()) continue
        text.style.fontSize = `${minimum}px`
        // At the floor, the two-line CSS clamp supplies the ellipsis.
        if (!fits()) continue
        let low = minimum, high = maximum
        while (high - low > .125) {
          const middle = (low + high) / 2
          text.style.fontSize = `${middle}px`
          if (fits()) low = middle; else high = middle
        }
        text.style.fontSize = `${low}px`
      }
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(track)
    window.addEventListener('resize', fit)
    void document.fonts?.ready.then(fit)
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', fit) }
  }, [player?.playing, player?.currentTrack?.title, player?.currentTrack?.artistName])
  return <div className="cockpit-radio" role={player ? 'group' : 'img'} aria-label={player ? `FM 电台 · ${label}` : '装饰用复古 FM 电台，未接入音源'}>
    <div className="cockpit-radio-body">
    <svg className="cockpit-radio-case" viewBox="0 0 150 220" aria-hidden="true">
      <defs><linearGradient id="radio-case" x2=".8" y2="1"><stop stopColor="#f0d596" /><stop offset=".4" stopColor="#b79b68" /><stop offset="1" stopColor="#655032" /></linearGradient></defs>
      <path d="M10 13 L139 13 L146 215 L5 215Z" fill="#302518" stroke="#1a130d" strokeWidth="3" />
      <rect x="3" y="3" width="136" height="204" rx="9" fill="url(#radio-case)" stroke="#ead095" strokeWidth="2" />
      <text x="13" y="23" className="radio-brand">FM / ANALOG</text>
      <rect x="12" y="34" width="116" height="76" rx="3" fill="#211f18" stroke="#ead095" />
      {!player?.playing && <g><text x="19" y="61" className="radio-scale">88  92  98  104 108</text>
        {Array.from({length:23},(_,i)=><path key={i} d={`M${18+i*4.7} 70 V${i%4===0?89:82}`} stroke="#bea575" />)}
        <path d="M73 65 V95" stroke="#f3d390" strokeWidth="2" /></g>}
      <circle cx="118" cy="23" r="3" fill={player?.playing ? '#9abd60' : '#ad8050'} />
      <rect x="12" y="160" width="68" height="30" rx="4" fill="#423520" stroke="#947442" />
      {Array.from({length:5},(_,i)=><path key={i} d={`M19 ${165+i*5} H73`} stroke="#19150d" strokeWidth="2" />)}
      <circle cx="105" cy="170" r="12" fill="#4d3921" stroke="#dfb979" strokeWidth="2" /><path d="M104 170 L100 161" stroke="#ebca8c" strokeWidth="2" />
      <text x="88" y="190" className="radio-scale">TUNE</text>
      <path d="M8 196 H129" stroke="#675034" /><circle cx="9" cy="10" r="2" fill="#5b492d" /><circle cx="132" cy="10" r="2" fill="#5b492d" />
    </svg>
    {player?.playing && player.currentTrack && <div className="cockpit-radio-screen" aria-live="polite">
      {cover && failedCover !== cover ? <img src={cover} alt={`${player.currentTrack.title}的专辑封面`} referrerPolicy="no-referrer" onError={() => setFailedCover(cover)} /> : <span className="cockpit-radio-no-cover">暂无封面</span>}
      <div ref={trackRef} className="cockpit-radio-track"><strong title={player.currentTrack.title}>{player.currentTrack.title}</strong><span title={player.currentTrack.artistName}>{player.currentTrack.artistName}</span></div>
    </div>}
    {player && <div className="cockpit-radio-transport">
      <button data-music-toggle className="cockpit-radio-skip" aria-label="上一首" title="上一首" disabled={!player.canSkip} onClick={player.previous}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4v12M16 4 7 10l9 6Z" /></svg></button>
      <button data-music-toggle className="cockpit-radio-play" aria-label={`${player.playing ? '暂停' : '播放'} ${label}`} aria-pressed={player.playing} onClick={() => player.toggle()} title={label}>{player.playing ? 'Ⅱ' : '▶'}</button>
      <button data-music-toggle className="cockpit-radio-skip" aria-label="下一首" title="下一首" disabled={!player.canSkip} onClick={player.next}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 4v12M4 4l9 6-9 6Z" /></svg></button>
    </div>}
    </div>
  </div>
}

export function DeskSignals() {
  const signalColors = ['#779c53','#91b363','#e3a251','#ce7442','#b34a36','#759250']
  // Attached to the central casing, so its own projected width is the boundary
  // on desktop, horizontally panned tablets, and the rotated phone viewport.
  return <svg className="desk-signals" viewBox="0 0 600 18" aria-hidden="true" focusable="false">
    {Array.from({length:18},(_,i)=><g key={i} transform={`translate(${12+i*576/17} 6)`}>
      <ellipse cy="3" rx="7" ry="5" fill="#271f14" /><ellipse rx="4.5" ry="3.5" fill={signalColors[i%6]} /><ellipse cx="-1.2" cy="-1.2" rx="1.3" ry=".8" fill="#f7dca0" opacity=".65" />
    </g>)}
  </svg>
}

// A bounded field of fine dither cells, generated once rather than updating
// React on every animation frame. The vapor widens and loses density/contrast
// with height. Interleaved cohorts drift independently without visible ribbons.
const steamLayers = Array.from({length:4}, () => [] as {x:number;y:number;fill:string;opacity:number}[])
const steamBayer = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5]
for (let row=0;row<48;row++) {
  const height=2+row*2, t=height/98, spread=8+t*30
  const center=59+Math.sin(t*7)*7+Math.sin(t*15)*3
  for (let col=0;col<75;col++) {
    const x=-15+col*2, q=(x-center)/spread
    let hash=Math.imul((row+11)^Math.imul(col+7,0x9e3779b1),0x85ebca6b)>>>0
    hash=Math.imul(hash^(hash>>>13),0xc2b2ae35)>>>0
    const random=hash/4294967296
    const threshold=.7*(steamBayer[(row%4)*4+col%4]+.5)/16+.3*random
    const density=.9*(1-.4*t)*Math.exp(-q*q/2)
    if (threshold>density) continue
    const edge=Math.exp(-q*q/3)*Math.min(1,height/8)*Math.min(1,(98-height)/18)
    const opacity=Number(((.84-.56*t)*edge).toFixed(3))
    const fill=`rgb(${Math.round(248-t*35)} ${Math.round(235-t*24)} ${Math.round(208-t*1)})`
    // Decouple motion cohorts from the ordered threshold lattice.
    steamLayers[(hash>>>3)%4].push({x,y:23-height,fill,opacity})
  }
}

export function DeskObjects() {
  return <svg className="cockpit-desk-objects" viewBox="0 -115 1800 285" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="keyboard-case" x2=".1" y2="1"><stop stopColor="#d7b778" /><stop offset=".4" stopColor="#85704b" /><stop offset="1" stopColor="#332819" /></linearGradient>
      <linearGradient id="keyboard-cap" x2=".4" y2="1"><stop stopColor="#f1d497" /><stop offset=".45" stopColor="#c4a26b" /><stop offset="1" stopColor="#897049" /></linearGradient>
      <linearGradient id="headphone-shell" x2=".8" y2="1"><stop stopColor="#a38f66" /><stop offset=".4" stopColor="#3c362a" /><stop offset="1" stopColor="#19160f" /></linearGradient>
      <linearGradient id="cup-case" x2="1" y2=".15"><stop stopColor="#5c462b" /><stop offset=".3" stopColor="#d5b079" /><stop offset=".65" stopColor="#b38d5a" /><stop offset="1" stopColor="#5a4028" /></linearGradient>
    </defs>
    <g className="desk-keyboard" transform="translate(633.5 41)">
      <ellipse cx="266.5" cy="113" rx="299" ry="18" fill="#100d09" opacity=".7" />
      <path d="M0 0 H533 L573 106 L568 120 H-35 L-40 106Z" fill="#40311e" stroke="#21180f" strokeWidth="3" />
      <path d="M0 0 H533 L568 103 H-35Z" fill="url(#keyboard-case)" stroke="#e9c78a" strokeWidth="2" />
      {Array.from({length:4},(_,row)=>{
        const y=8+row*21, scale=1+(y+7.5)/103*70/533
        // Key rows share the case's vanishing point instead of shifting sideways
        // at a fixed size; the near rows widen and deepen with the desk plane.
        return <g key={row} data-key-row={row} transform={`translate(266.5 ${y}) scale(${scale}) translate(-266.5 0)`}>{Array.from({length:15},(_,col)=>{
          const x=21+col*33
          return <g key={col}><rect x={x+1} y="3" width="29" height="17" rx="2" fill="#342615" /><rect className="keyboard-key-cap" x={x} y="0" width="29" height="15" rx="2" fill="url(#keyboard-cap)" stroke="#6c5330" /><path d={`M${x+8} 5 h6`} stroke="#514027" strokeWidth="1" /></g>
        })}</g>
      })}
      <path d="M134 94 H397 L401 106 H130Z" fill="url(#keyboard-cap)" stroke="#6c5330" />
      <path d="M-27 107 H553" stroke="#b99c69" /><path d="M15 5 H525" stroke="#f2d795" />
    </g>
    <g className="desk-headphones" transform="translate(207 69) rotate(-12)">
      <ellipse cx="112" cy="60" rx="105" ry="27" fill="#0b0906" opacity=".65" />
      <path d="M28 48 C6 -52 193 -59 203 38" fill="none" stroke="#15130e" strokeWidth="27" />
      <path d="M28 42 C18 -43 185 -48 201 32" fill="none" stroke="url(#headphone-shell)" strokeWidth="18" />
      <path d="M30 34 C32 -35 167 -41 191 27" fill="none" stroke="#b6a076" strokeWidth="3" />
      <path d="M39 35 L31 72 M185 30 L196 68" stroke="#968565" strokeWidth="9" />
      <ellipse cx="38" cy="58" rx="28" ry="39" fill="url(#headphone-shell)" stroke="#ab9467" strokeWidth="2" transform="rotate(-18 38 58)" />
      <ellipse cx="193" cy="52" rx="26" ry="36" fill="url(#headphone-shell)" stroke="#ab9467" strokeWidth="2" transform="rotate(22 193 52)" />
      <ellipse cx="40" cy="60" rx="17" ry="28" fill="#1d1a13" /><ellipse cx="192" cy="53" rx="15" ry="25" fill="#1d1a13" />
      <path d="M209 67 C279 87 193 113 260 114 S349 98 374 127" fill="none" stroke="#211b12" strokeWidth="4" /><path d="M209 66 C279 86 193 112 260 113" fill="none" stroke="#8c7752" strokeWidth="1" />
    </g>
    <g className="desk-coffee" transform="translate(1438 30)">
      <ellipse cx="65" cy="117" rx="77" ry="18" fill="#0c0906" opacity=".65" />
      <ellipse cx="57" cy="108" rx="70" ry="13" fill="#b69259" stroke="#5d4528" strokeWidth="2" />
      <path d="M105 48 C159 28 155 109 108 99" fill="none" stroke="#46301b" strokeWidth="16" /><path d="M106 45 C145 30 146 100 109 95" fill="none" stroke="#bfa16f" strokeWidth="9" />
      <path d="M5 35 Q2 91 18 103 Q57 123 103 101 L113 35Z" fill="url(#cup-case)" stroke="#755231" strokeWidth="2" />
      <ellipse cx="59" cy="35" rx="54" ry="15" fill="#2d2114" stroke="#e5bd80" strokeWidth="4" /><ellipse cx="59" cy="36" rx="46" ry="10" fill="#22170c" /><path d="M22 34 Q50 28 87 34" fill="none" stroke="#766040" strokeWidth="2" />
      <g className="coffee-steam" stroke="none">
        {steamLayers.map((pixels,layer)=><g key={layer} className="coffee-steam-layer" style={{'--steam-duration':`${5.2+layer*.7}s`,'--steam-phase':`${-layer*1.8}s`,'--steam-drift':`${layer%2===0?-5:7}px`} as CSSProperties}>
          {pixels.map((pixel,index)=><rect key={index} {...pixel} width="1.9" height="1.9" />)}
        </g>)}
      </g>
    </g>
  </svg>
}
