// Two fixed resolutions, eight immutable frames each: at most 3.6 MiB.
// Warm lazily, so mounting a screen never generates the entire bank at once.
const banks = new Map<boolean, ImageData[]>()
export function crtNoiseFrame(ctx: CanvasRenderingContext2D, mini: boolean, index: number) {
  let bank = banks.get(mini)
  if (!bank) { bank = []; banks.set(mini, bank) }
  const slot = index % 8
  if (!bank[slot]) {
    const frame = ctx.createImageData(mini ? 120 : 420, mini ? 70 : 260)
    for (let i = 0; i < frame.data.length; i += 4) {
      const value = Math.random() > .7 ? 230 : Math.random() * 80
      frame.data[i] = value; frame.data[i + 1] = value; frame.data[i + 2] = value; frame.data[i + 3] = 255
    }
    bank[slot] = frame
  }
  return bank[slot]
}
