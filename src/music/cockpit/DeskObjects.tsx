/** Lightweight, reusable 2.5D desk props. Their entire painted surface passes
 * through the opaque hardware dither; these ornaments never intercept input. */
export function RetroRadio() {
  return <div className="cockpit-radio" role="img" aria-label="装饰用复古 FM 电台，未接入音源">
    <svg viewBox="0 0 150 220" aria-hidden="true">
      <defs><linearGradient id="radio-case" x2=".8" y2="1"><stop stopColor="#f0d596" /><stop offset=".4" stopColor="#b79b68" /><stop offset="1" stopColor="#655032" /></linearGradient></defs>
      <path d="M10 13 L139 13 L146 215 L5 215Z" fill="#302518" stroke="#1a130d" strokeWidth="3" />
      <rect x="3" y="3" width="136" height="204" rx="9" fill="url(#radio-case)" stroke="#ead095" strokeWidth="2" />
      <text x="13" y="23" className="radio-brand">FM / ANALOG</text>
      <rect x="12" y="34" width="116" height="54" rx="3" fill="#282318" stroke="#ead095" />
      <text x="19" y="51" className="radio-scale">88  92  98  104 108</text>
      {Array.from({length:23},(_,i)=><path key={i} d={`M${18+i*4.7} 60 V${i%4===0?74:68}`} stroke="#bea575" />)}
      <path d="M73 55 V79" stroke="#f3d390" strokeWidth="2" /><circle cx="118" cy="23" r="3" fill="#ad8050" />
      <rect x="12" y="99" width="68" height="87" rx="4" fill="#423520" stroke="#947442" />
      {Array.from({length:12},(_,i)=><path key={i} d={`M19 ${105+i*6.3} H73`} stroke="#19150d" strokeWidth="3" />)}
      <circle cx="105" cy="121" r="17" fill="#493722" stroke="#e5be7d" strokeWidth="3" /><circle cx="105" cy="121" r="11" fill="#c9a86b" /><path d="M105 121 L111 112" stroke="#44311c" strokeWidth="2" />
      <circle cx="105" cy="163" r="12" fill="#4d3921" stroke="#dfb979" strokeWidth="2" /><path d="M104 163 L100 154" stroke="#ebca8c" strokeWidth="2" />
      <text x="88" y="190" className="radio-scale">TUNE</text>
      <path d="M8 196 H129" stroke="#675034" /><circle cx="9" cy="10" r="2" fill="#5b492d" /><circle cx="132" cy="10" r="2" fill="#5b492d" />
    </svg>
  </div>
}

export function DeskObjects() {
  const signalColors = ['#779c53','#91b363','#e3a251','#ce7442','#b34a36','#759250']
  return <svg className="cockpit-desk-objects" viewBox="0 0 1800 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="keyboard-case" x2=".1" y2="1"><stop stopColor="#d7b778" /><stop offset=".4" stopColor="#85704b" /><stop offset="1" stopColor="#332819" /></linearGradient>
      <linearGradient id="keyboard-cap" x2=".4" y2="1"><stop stopColor="#f1d497" /><stop offset=".45" stopColor="#c4a26b" /><stop offset="1" stopColor="#897049" /></linearGradient>
      <linearGradient id="headphone-shell" x2=".8" y2="1"><stop stopColor="#a38f66" /><stop offset=".4" stopColor="#3c362a" /><stop offset="1" stopColor="#19160f" /></linearGradient>
      <linearGradient id="cup-case" x2="1" y2=".15"><stop stopColor="#5c462b" /><stop offset=".3" stopColor="#d5b079" /><stop offset=".65" stopColor="#b38d5a" /><stop offset="1" stopColor="#5a4028" /></linearGradient>
    </defs>
    <g className="desk-signals">
      {Array.from({length:32},(_,i)=><g key={i} transform={`translate(${200+i*45} ${12+Math.abs(i-15.5)*.38})`}>
        <ellipse cy="3" rx="7" ry="5" fill="#271f14" /><ellipse rx="4.5" ry="3.5" fill={signalColors[i%6]} /><ellipse cx="-1.2" cy="-1.2" rx="1.3" ry=".8" fill="#f7dca0" opacity=".65" />
      </g>)}
    </g>
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
      <g className="coffee-steam" fill="none" stroke="#dbc895" strokeWidth="3" strokeLinecap="round">
        <path d="M37 20 C14 0 60 -9 38 -32" /><path d="M64 17 C85 -1 37 -12 65 -43" /><path d="M84 21 C105 2 73 -6 86 -26" />
      </g>
    </g>
  </svg>
}
