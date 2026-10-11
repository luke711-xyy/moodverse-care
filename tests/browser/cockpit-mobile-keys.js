// Run in a phone-sized landscape viewport or the app's rotated portrait viewport,
// after document.fonts.ready. Desktop lettering is covered by key-legibility.
export function assertCockpitMobileKeys(root = document) {
  const view = root.defaultView, app = root.querySelector('.music-app')
  if (!view || !app || app.clientWidth > 1000 || app.clientHeight > 600) throw new Error('Expected a mobile music viewport')
  const failures = [], keys = [], panels = []
  const buttons = [...root.querySelectorAll('.cockpit-console-scroll .cockpit-keys button,.cockpit-console-scroll .cockpit-settings-key')]
  if (buttons.length !== 7) failures.push('Expected all seven physical menu keys')
  for (const button of buttons) {
    const style = view.getComputedStyle(button), range = root.createRange()
    range.selectNodeContents(button)
    const fragments = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    const text = range.getBoundingClientRect(), key = button.getBoundingClientRect()
    const record = { label: button.textContent.trim(), size: parseFloat(style.fontSize), fragments: fragments.length,
      height: button.offsetHeight, fits: text.left >= key.left - 1 && text.right <= key.right + 1
        && text.top >= key.top - 1 && text.bottom <= key.bottom + 1 }
    keys.push(record)
    // The settings key includes an inner span, so its Range has extra inline boxes.
    const wrappedMenu = button.closest('.cockpit-keys') && fragments.length !== 1
    if (record.size > 11 || style.whiteSpace !== 'nowrap' || wrappedMenu || !record.fits) failures.push(`${record.label}: oversized, wrapped or overflowing legend`)
    if (!style.fontFamily.includes('Unifont') || style.fontWeight !== '400') failures.push(`${record.label}: changed key font`)
  }
  for (const id of ['cockpit-personal', 'cockpit-exploration']) {
    const panel = root.getElementById(id), row = panel?.querySelector('.cockpit-keys'), monitor = panel?.querySelector('.cockpit-monitor')
    if (!row || !monitor) { failures.push(`Missing ${id}`); continue }
    panels.push({ id, rowHeight: row.offsetHeight, screenHeight: monitor.clientHeight })
    if (row.offsetHeight > 32) failures.push(`${id}: wrapped keys consume the monitor space`)
    if (monitor.clientHeight < 65) failures.push(`${id}: monitor was squeezed`)
    if ([...row.querySelectorAll('button')].some(button => button.offsetHeight < 31)) failures.push(`${id}: key hit areas were shrunk`)
  }
  if (failures.length) throw new Error(JSON.stringify({ failures, keys, panels }))
  return { keys, panels, viewport: { width: app.clientWidth, height: app.clientHeight } }
}
