// Run in the real local preview or production cockpit. CSS custom-property
// inheritance is checked through computed styles, not stylesheet text.
export function assertCockpitFontScope({ root = document, requireGalaxy = false, requireCommunicator = false } = {}) {
  const hardware = ['.cockpit-personal-telemetry', '.cockpit-signal-map', '.cockpit-galaxy-readout']
  const content = ['.cockpit-terminal', '.cockpit-terminal .dither-title', '.cockpit-terminal .music-kicker', '.cockpit-terminal .music-cd-no-art', '.cockpit-terminal textarea',
    '.music-galaxy-dialog', '.music-galaxy-dialog .dither-title', '.music-galaxy-dialog p',
    '.mosic-communicator', '.mosic-communicator h2', '.mosic-communicator p', '.mosic-communicator textarea']
  const records = [], failures = []
  if (!document.fonts.check('400 14px Unifont', '星球资料与歌曲调整外观返回驾驶舱关闭发送')) failures.push('Expanded-control Unifont has not loaded')
  if (root.querySelector('.cockpit-terminal-footer > span,.cockpit-terminal-footer small')) failures.push('Redundant terminal footer captions returned')
  for (const [selectors, retro] of [[hardware, true], [content, false]]) for (const selector of selectors) {
    const elements = [...root.querySelectorAll(selector)]
    if (retro && !elements.length) failures.push(`Missing hardware: ${selector}`)
    for (const element of elements) {
      const font = getComputedStyle(element).fontFamily
      records.push({ selector, font, retro })
      if (font.includes('MOSIC Console') !== retro || (!retro && (font.includes('MOSIC Key Legends') || font.includes('Unifont')))) failures.push(`${selector}: ${font}`)
    }
  }
  for (const element of root.querySelectorAll('.cockpit-terminal button,.music-galaxy-dialog button,.mosic-communicator button,.mosic-communicator .communicator-photo-button')) {
    const style = getComputedStyle(element)
    records.push({ selector: element.className || element.textContent, font: style.fontFamily, retro: false, control: true })
    if (!style.fontFamily.includes('Unifont') || style.fontWeight !== '400' || style.fontSynthesis !== 'none') failures.push(`Control must use regular Unifont without synthetic bold: ${element.textContent}: ${style.fontFamily}/${style.fontWeight}`)
  }
  if (requireGalaxy && !root.querySelector('.music-galaxy-dialog p')) failures.push('Galaxy description was not mounted')
  for (const element of root.querySelectorAll('.cockpit-radio-screen')) {
    if (!getComputedStyle(element).fontFamily.includes('MOSIC Console')) failures.push('Radio display must retain its console font')
  }
  if (requireCommunicator) {
    if (!root.querySelector('.mosic-communicator textarea')) failures.push('Communicator was not mounted')
    const normalFont = getComputedStyle(root.body ?? document.body).fontFamily
    for (const element of root.querySelectorAll('.mosic-communicator p,.mosic-communicator textarea')) {
      if (getComputedStyle(element).fontFamily !== normalFont) failures.push('Private-message text must use the normal body font')
    }
  }
  if (failures.length) throw new Error(`Cockpit font scope regression: ${JSON.stringify({ failures, records })}`)
  return records
}
