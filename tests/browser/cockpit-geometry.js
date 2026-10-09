// Run against the rendered cockpit, not stylesheet text. For example, import
// this module in the local QA tab and call assertCockpitGeometry(document).
export function assertCockpitGeometry(root = document) {
  const point = el => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const app = root.querySelector('.music-app').getBoundingClientRect()
  const turned = app.height > app.width
  const center = root.querySelector('#cockpit-exploration').getBoundingClientRect()
  const centerOffset = turned ? center.top + center.height / 2 - (app.top + app.height / 2)
    : center.left + center.width / 2 - (app.left + app.width / 2)
  const wings = ['#cockpit-personal', '#cockpit-controls'].map((selector, index) => {
    const wing = root.querySelector(selector), rect = wing.getBoundingClientRect()
    const corners = ['tl', 'tr', 'br', 'bl'].map(corner => point(wing.querySelector(`.screw-${corner}`)))
    const left = distance(corners[0], corners[3]), right = distance(corners[1], corners[2])
    return { selector, nearToFar: index === 0 ? left / right : right / left,
      inWindow: rect.left >= app.left - 1 && rect.right <= app.right + 1 && rect.top >= app.top - 1 && rect.bottom <= app.bottom + 1 }
  })
  const keyWidth = row => {
    const r = root.querySelector(`[data-key-row="${row}"] .keyboard-key-cap`).getBoundingClientRect()
    return turned ? r.height : r.width
  }
  const keyNearToFar = keyWidth(3) / keyWidth(0)
  const keyOverflow = [...root.querySelectorAll('.cockpit-keys')].some(el => el.scrollWidth > el.clientWidth + 1)
  const report = { centerOffset, wings, keyNearToFar, keyOverflow, documentOverflow: root.documentElement.scrollWidth > root.documentElement.clientWidth }
  if (Math.abs(centerOffset) > 1 || wings.some(wing => wing.nearToFar < 1.025 || !wing.inWindow) || keyNearToFar < 1.04 || keyOverflow || report.documentOverflow) {
    throw new Error(`Cockpit projection regression: ${JSON.stringify(report)}`)
  }
  return report
}
