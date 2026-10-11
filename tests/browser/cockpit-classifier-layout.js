// Capture once with the previous released desk stylesheet, then compare with
// current styles at the same viewport. The settings row must keep its space so
// the size-container-driven knob and three glass windows cannot grow into it.
export function readCockpitClassifierLayout(root = document) {
  const panel = root.querySelector('#cockpit-controls')
  if (!panel) throw new Error('Galaxy control panel was not mounted')
  const selectors = ['.cockpit-galaxy-display', '.cockpit-galaxy-dial',
    '.cockpit-knob-body', '.sector-song', '.sector-artist', '.sector-genre', '.cockpit-settings-key']
  const records = selectors.map(selector => {
    const element = panel.querySelector(selector)
    if (!element) throw new Error(`Missing Galaxy control: ${selector}`)
    const style = getComputedStyle(element)
    return { selector, width: parseFloat(style.width), height: parseFloat(style.height),
      top: element.offsetTop, left: element.offsetLeft, position: style.position }
  })
  return records
}

export function assertCockpitClassifierLayout(reference, root = document) {
  const records = readCockpitClassifierLayout(root), failures = []
  for (const record of records) {
    const previous = reference.find(item => item.selector === record.selector)
    if (!previous) throw new Error(`No reference control: ${record.selector}`)
    // A new typeface can change the settings label's width, not its row height
    // or any dial/window geometry. Preserve right alignment instead of left.
    const fields = record.selector === '.cockpit-settings-key' ? ['height', 'top'] : ['width', 'height', 'top', 'left']
    for (const field of fields) if (Math.abs(record[field] - previous[field]) > 1) {
      failures.push(`${record.selector} ${field}: ${record[field]} vs ${previous[field]}`)
    }
    if (record.selector === '.cockpit-settings-key'
      && Math.abs(record.left + record.width - previous.left - previous.width) > 1) {
      failures.push('Settings key lost its original right alignment')
    }
  }
  if (records.at(-1).position !== 'relative') failures.push('Settings must occupy its original row below the dial')
  if (failures.length) throw new Error(JSON.stringify({ failures, records, reference }))
  return records
}
