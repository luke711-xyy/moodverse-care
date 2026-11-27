import { useState } from 'react'
import type { DesktopStatus } from './desktop-bridge'
import { ConnectionSettings, type ModelSession } from './connection'
import type { CopilotPatch, CopilotState } from './contracts'

export function CopilotSettingsPanel({
  state,
  busy,
  patch,
  clearHistory,
  session,
  setSession,
  desktop,
  onDesktopSettings,
}: {
  state: CopilotState
  busy: boolean
  patch: (change: CopilotPatch) => Promise<boolean>
  clearHistory: () => Promise<boolean>
  session: ModelSession
  setSession: (session: ModelSession) => void
  desktop?: DesktopStatus | null
  onDesktopSettings?: () => void
}) {
  const { settings, memories } = state
  const [name, setName] = useState(settings.name)
  const [memoryText, setMemoryText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'history' | 'memory' | null>(null)
  const [cleared, setCleared] = useState(false)
  const local = session.provider === 'desktop' || session.provider === 'browser-local'
  const saveMemory = async () => {
    const text = memoryText.trim()
    if (!text || busy) return
    if (await patch({ memory: editing ? { action: 'edit', id: editing, text } : { action: 'add', text } })) {
      setMemoryText('')
      setEditing(null)
    }
  }
  return (
    <div className="cp-settings">
      <ConnectionSettings session={session} busy={busy} desktop={desktop} onDesktopSettings={onDesktopSettings}
        onChange={next => { setConfirm(null); setCleared(false); setSession(next) }} />
      <fieldset disabled={busy}>
        <legend>通讯设置</legend>
        <form
          className="cp-inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) void patch({ settings: { name: name.trim() } })
          }}
        >
          <label>
            副驾呼号
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          <button disabled={!name.trim() || name.trim() === settings.name}>保存呼号</button>
        </form>
        <label>
          说话风格
          <select
            value={settings.personality}
            onChange={(event) =>
              void patch({ settings: { personality: event.target.value as typeof settings.personality } })
            }
          >
            <option value="warm">沉着亲和</option>
            <option value="concise">简短直接</option>
            <option value="playful">轻快活泼</option>
          </select>
        </label>
        <label>
          主动提示
          <select
            value={settings.proactivity}
            onChange={(event) =>
              void patch({ settings: { proactivity: event.target.value as typeof settings.proactivity } })
            }
          >
            <option value="off">只在呼叫时回应</option>
            <option value="low">偶尔提示</option>
            <option value="normal">常规提示</option>
          </select>
        </label>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>个人记忆</legend>
        {session.provider === 'desktop' && <small>这些记忆用于网页连接。桌面连接使用这台 Mac 上的独立上下文。</small>}
        <label className="cp-check">
          <input
            type="checkbox"
            checked={settings.memoryEnabled}
            onChange={(event) => void patch({ settings: { memoryEnabled: event.target.checked } })}
          />
          在对话中使用和更新记忆
        </label>
        {memories.length === 0 ? (
          <small>还没有保存的记忆。</small>
        ) : (
          <ul className="cp-memories">
            {memories.map((memory) => (
              <li key={memory.id}>
                <span>
                  {memory.text}
                  {memory.expiresAt && (
                    <small>有效至 {new Date(memory.expiresAt).toLocaleDateString('zh-CN')}</small>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`编辑记忆 ${memory.text}`}
                  onClick={() => {
                    setEditing(memory.id)
                    setMemoryText(memory.text)
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  aria-label={`忘记 ${memory.text}`}
                  onClick={async () => {
                    if ((await patch({ memory: { action: 'forget', id: memory.id } })) && editing === memory.id) {
                      setEditing(null)
                      setMemoryText('')
                    }
                  }}
                >
                  忘记
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void saveMemory()
          }}
          className="cp-inline-form"
        >
          <label>
            {editing ? '修改记忆' : '添加记忆'}
            <input
              value={memoryText}
              maxLength={180}
              onChange={(event) => setMemoryText(event.target.value)}
              placeholder="例如，我喜欢器乐版"
            />
          </label>
          <button disabled={!memoryText.trim()}>保存记忆</button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setMemoryText('')
              }}
            >
              取消
            </button>
          )}
        </form>
        {memories.length > 0 && (
          <button type="button" onClick={() => setConfirm('memory')}>
            清空记忆
          </button>
        )}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>聊天历史</legend>
        <small>{local ? '本机通讯记录' : '平台通讯记录'}按本地日期归档。当前通讯显示今天的消息。</small>
        <button type="button" onClick={() => { setCleared(false); setConfirm('history') }}>清空对话记录</button>
        {cleared && <small role="status">对话记录已清空。</small>}
      </fieldset>
      {confirm && (
        <div className="cp-confirm" role="group" aria-label="确认清理">
          <p>{confirm === 'history' ? `清空${session.provider === 'browser-local' ? '这个浏览器中当前驾驶员的' : local ? '这台 Mac 上的驾驶舱' : '当前账号的云端'}全部对话记录？此操作无法撤销。` : '清空已保存的全部记忆？'}</p>
          <button
            disabled={busy}
            onClick={async () => {
              if (confirm === 'history') {
                if (await clearHistory()) { setConfirm(null); setCleared(true) }
              } else if (await patch({ memory: { action: 'clear' } })) {
                setConfirm(null)
                setEditing(null)
                setMemoryText('')
              }
            }}
          >
            确认清空
          </button>
          <button onClick={() => setConfirm(null)}>取消</button>
        </div>
      )}
    </div>
  )
}
