/** Ordered color quantization inspired by dither-hero's Bayer threshold
 * pipeline. It processes SourceGraphic, so
 * cases, glyphs and controls are dithered too, not just a noise overlay. */
const bayer = [0,48,12,60,3,51,15,63,32,16,44,28,35,19,47,31,8,56,4,52,11,59,7,55,40,24,36,20,43,27,39,23,2,50,14,62,1,49,13,61,34,18,46,30,33,17,45,29,10,58,6,54,9,57,5,53,42,26,38,22,41,25,37,21]
const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`
const thresholdTile = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${bayer.map((v,i) => `<rect x="${i%8*2}" y="${Math.floor(i/8)*2}" width="2" height="2" fill="rgb(${Math.round(v/63*255)} ${Math.round(v/63*255)} ${Math.round(v/63*255)})"/>`).join('')}</svg>`)
export const SURFACE_FILTER = 'moodverse-hardware-dither'
export const INK_FILTER = 'moodverse-ink-dither'
const steps = Array.from({ length: 12 }, (_, i) => i / 11).join(' ')
export function DitherSurfaceDefinitions() {
  return <svg className="cockpit-filter-definitions" aria-hidden="true" width="0" height="0"><defs>
    {[SURFACE_FILTER, INK_FILTER].map(id => <filter key={id} id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      {/* Full-coverage ordered dithering: thresholds affect RGB only. No sparse
          sampling mask or alpha quantization may perforate solid hardware. */}
      <feImage href={thresholdTile} x="0" y="0" width="16" height="16" result="threshold" />
      <feTile in="threshold" result="bayer" />
      <feComposite in="SourceGraphic" in2="bayer" operator="arithmetic" k2="1" k3=".1" k4="-.05" result="biased" />
      <feComponentTransfer in="biased" result="quantized">
        <feFuncR type="discrete" tableValues={steps} /><feFuncG type="discrete" tableValues={steps} /><feFuncB type="discrete" tableValues={steps} />
      </feComponentTransfer>
      <feComposite in="quantized" in2="SourceGraphic" operator="atop" />
    </filter>)}
  </defs></svg>
}
