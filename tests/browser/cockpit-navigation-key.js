export function assertNavigationKey(root = document) {
  const cockpit = root.querySelector('.cockpit')
  const key = root.querySelector('.cockpit-flight-lever')
  const cap = key?.querySelector('.flight-keycap')
  if (!cockpit || !key || !cap) throw new Error('Missing raised navigation key')
  const label = cockpit.dataset.exterior === 'home' ? 'Galaxy' : '回星球'
  const bounds = key.getBoundingClientRect(), bay = key.parentElement.getBoundingClientRect()
  const text = key.querySelector('small'), range = document.createRange()
  range.selectNodeContents(text)
  const printed = range.getBoundingClientRect()
  const result = {
    exterior: cockpit.dataset.exterior, label: key.getAttribute('aria-label'), caption: text.textContent,
    rounded: parseFloat(getComputedStyle(cap).borderRadius) >= 5,
    raised: getComputedStyle(cap).boxShadow !== 'none',
    capSize: [cap.offsetWidth,cap.offsetHeight], hitSize: [key.offsetWidth,key.offsetHeight],
    keyFilter: getComputedStyle(key).filter,
    withinBay: bounds.left >= bay.left - 1 && bounds.right <= bay.right + 1 && bounds.bottom <= bay.bottom + 1,
    captionFits: printed.left >= bounds.left - 1 && printed.right <= bounds.right + 1,
    alerts: [...root.querySelectorAll('[role=alert]')].map(x => x.textContent),
  }
  if (result.label !== label || result.caption !== label || !result.rounded || !result.raised
    || cap.offsetWidth < Math.min(30,key.offsetWidth - 4) || cap.offsetHeight < 30
    || key.offsetHeight < 44 || !result.withinBay || !result.captionFits
    || result.keyFilter !== 'none' || result.alerts.length) throw new Error(JSON.stringify(result))
  return result
}
