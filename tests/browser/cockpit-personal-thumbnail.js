export function assertPersonalThumbnail(root = document) {
  const panel = root.querySelector('.cockpit-personal-telemetry')
  const thumbnail = panel?.querySelector('.telemetry-planet-thumbnail')
  const name = panel?.querySelector('.telemetry-callsign')
  const canvas = thumbnail?.querySelector('canvas')
  const mark = thumbnail?.querySelector('.dither-planet-mark')
  const metrics = panel?.querySelector('.telemetry-metrics')
  const content = panel?.parentElement
  const identity = panel?.querySelector('.telemetry-identity')
  if (!thumbnail || !name || !canvas || !mark || !metrics || !content || !identity) throw new Error('Missing personal planet thumbnail/readout')
  const t = thumbnail.getBoundingClientRect(), n = name.getBoundingClientRect()
  const image = mark.getBoundingClientRect()
  const m = metrics.getBoundingClientRect(), p = panel.getBoundingClientRect()
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  let opaquePixels = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]) opaquePixels++
  const result = {
    label: thumbnail.getAttribute('aria-label'), opaquePixels,
    rightOfName: image.left > n.right, aboveMetrics: image.bottom <= m.top + 1,
    centered: Math.abs(thumbnail.offsetLeft + thumbnail.offsetWidth / 2 - identity.clientWidth / 2) <= 1,
    enlarged: image.width >= t.width * 1.5 && image.height >= t.height * 1.5,
    bottomLeftAnchored: Math.abs(image.left - t.left) <= 1 && Math.abs(image.bottom - t.bottom) <= 1,
    size: [image.width, image.height], slotSize: [t.width, t.height],
    withinPanel: image.left >= p.left && image.right <= p.right && image.top >= p.top && image.bottom <= p.bottom,
    overflow: [content.scrollWidth - content.clientWidth, content.scrollHeight - content.clientHeight],
    metrics: [...metrics.querySelectorAll('dt')].map(x => x.textContent),
  }
  if (result.label !== `${name.textContent}的星球缩略图` || opaquePixels <= 100
    || !result.rightOfName || !result.aboveMetrics || !result.centered || !result.enlarged || !result.bottomLeftAnchored || !result.withinPanel
    || result.overflow.some(value => value > 1)) throw new Error(JSON.stringify(result))
  return result
}
