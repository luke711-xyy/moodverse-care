// Run after fonts load. In Chromium, force only the shipped WebKit @supports
// block to test its fallback, not to claim an iPad/WebKit engine test.
export function enableCockpitWebKitFallback(root = document) {
  const blocks = []
  const visit = rules => {
    for (const rule of rules) {
      if (rule.conditionText === '(-webkit-touch-callout: none)') blocks.push(...[...rule.cssRules].map(child => child.cssText))
      else if (rule.cssRules) visit(rule.cssRules)
    }
  }
  for (const sheet of root.styleSheets) visit(sheet.cssRules)
  if (!blocks.length) throw new Error('Missing WebKit hardware fallback')
  const style = root.createElement('style')
  style.textContent = blocks.join('\n')
  root.head.append(style)
  return () => style.remove()
}

export function assertCockpitHardwareFallback(root = document, safeMaterials = false) {
  const view = root.defaultView, failures = [], keys = []
  const buttons = [...root.querySelectorAll('.cockpit-console-scroll .cockpit-keys button,.cockpit-console-scroll .cockpit-settings-key')]
  if (buttons.length !== 7) failures.push('Missing physical keys')
  for (const button of buttons) {
    const style = view.getComputedStyle(button)
    const borderVisible = style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0 && !/rgba\([^)]*, 0\)/.test(style.borderTopColor)
    const record = { label: button.textContent.trim(), background: style.backgroundImage, borderVisible, shadow: style.boxShadow, filter: style.filter }
    keys.push(record)
    if (style.backgroundImage === 'none' || !borderVisible || style.boxShadow === 'none') failures.push(`${record.label}: key shape depends entirely on the filtered pseudo-element`)
    if (style.filter !== 'none') failures.push(`${record.label}: material filter affects the legend`)
  }
  const gauges = [...root.querySelectorAll('.cockpit-gauge svg')]
  if (gauges.length !== 2 || gauges.some(svg => svg.getBoundingClientRect().height < 20)) failures.push('Missing or collapsed gauges')
  if (root.querySelectorAll('.cockpit-radio-transport button').length !== 3) failures.push('Missing radio keys')
  if (safeMaterials) {
    for (const node of root.querySelectorAll('.cockpit *,.music-galaxy-dialog')) {
      for (const pseudo of [null, '::before', '::after']) {
        if (view.getComputedStyle(node, pseudo).filter.includes('moodverse-hardware-dither')) failures.push(`${node.classList}: unsafe SVG material filter remains on ${pseudo ?? 'element'}`)
      }
    }
  }
  if (failures.length) throw new Error(JSON.stringify({ failures, keys }))
  return { keys, gauges: gauges.length, radioKeys: 3, safeMaterials }
}
