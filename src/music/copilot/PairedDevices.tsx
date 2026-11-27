import { useState } from 'react'

type Device = { id: string; pairedAt: number }
export function PairedDevices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function update(action?: 'create' | 'revoke', id?: string) {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (action) {
        const changed = await fetch('/api/me/copilot-devices', { method: 'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({action,id}) })
        if (!changed.ok) throw new Error()
        if (action === 'create') setCode((await changed.json()).code)
      }
      const response = await fetch('/api/me/copilot-devices')
      if (!response.ok) throw new Error()
      setDevices((await response.json()).devices)
    } catch { setError('暂时无法读取设备，请重试。') }
    finally { setBusy(false) }
  }
  return <details className="music-settings-section" onToggle={e=>{ if (e.currentTarget.open) void update(); else setCode('') }}>
    <summary>连接桌面副驾</summary>
    <p>在 Mac 的 MOSIC 副驾输入一次性配对码，就能查询同歌星球。配对码五分钟有效。</p>
    <a href="/desktop/">下载桌面副驾 ↗</a>
    <button type="button" disabled={busy} onClick={()=>void update('create')}>生成配对码</button>
    {code && <output aria-live="polite">{code}</output>}
    {devices.map(device=><p key={device.id}>桌面副驾 · {new Date(device.pairedAt).toLocaleString('zh-CN')} <button type="button" disabled={busy} onClick={()=>void update('revoke',device.id)}>断开</button></p>)}
    {error && <p role="alert">{error}</p>}
  </details>
}
