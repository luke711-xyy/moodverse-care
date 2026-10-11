// Run against the rendered cockpit after fonts have loaded. Catches condensed
// Chinese lettering or a material filter being reapplied to the key legends.
export function assertCockpitKeyLegibility(root = document) {
  const buttons = [...root.querySelectorAll('.cockpit-console-scroll .cockpit-keys button,.cockpit-console-scroll .cockpit-settings-key,.cockpit-console-scroll .cockpit-flight-lever')]
  const failures = [], records = []
  if (!buttons.length) failures.push('No physical cockpit keys were mounted')
  for (const button of buttons) {
    const legend = button.querySelector('small') ?? button
    const style = getComputedStyle(legend), cap = button.querySelector('.flight-keycap')
    const material = cap ? getComputedStyle(cap) : getComputedStyle(button, '::before')
    // scrollWidth includes the overhanging keycap pseudo-element. Measure the
    // actual legend instead, in the same transformed plane as its physical key.
    const range = document.createRange()
    range.selectNodeContents(legend)
    const text = range.getBoundingClientRect(), key = button.getBoundingClientRect()
    const filteredAncestors = []
    for (let parent = button; parent?.closest('.cockpit-console-scroll'); parent = parent.parentElement) {
      if (getComputedStyle(parent).filter !== 'none') filteredAncestors.push(parent.className)
    }
    const record = {
      label: button.textContent.trim(), font: style.fontFamily,
      weight: Number(style.fontWeight), size: parseFloat(style.fontSize),
      spacing: parseFloat(style.letterSpacing), filteredAncestors,
      materialFilter: material.filter,
      fits: text.left >= key.left - 1 && text.right <= key.right + 1
        && text.top >= key.top - 1 && text.bottom <= key.bottom + 1,
    }
    records.push(record)
    if (!record.font.includes('Unifont') || record.weight !== 400) failures.push(`${record.label}: requested Unifont regular is not applied`)
    if (record.font.includes('MOSIC Console Han')) failures.push(`${record.label}: condensed Chinese font`)
    if (record.filteredAncestors.length) failures.push(`${record.label}: material filter affects lettering`)
    if (record.weight > 600 || record.size < 12 || !(record.spacing >= 1)) failures.push(`${record.label}: cramped legend`)
    if (!record.materialFilter.includes('moodverse-hardware-dither')) failures.push(`${record.label}: missing material texture`)
    if (!record.fits) failures.push(`${record.label}: overflowing legend`)
    if (button.matches('.cockpit-settings-key') && style.position !== 'relative') failures.push('Settings key must remain in the right panel flow below the dial')
  }
  if (new Set(records.map(record => record.font)).size !== 1) failures.push('Physical key legends use inconsistent font families')
  if (failures.length) throw new Error(JSON.stringify({ failures, records }))
  return records
}
