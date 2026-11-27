import { useState } from 'react'
import { desktopProviders, type DesktopStatus } from './desktop-bridge'
import type { CopilotPatch, CopilotProvider, CopilotState } from './contracts'

export type ModelSession = { provider: CopilotProvider | 'desktop'; key: string; model: string }
export const platformSession: ModelSession = { provider: 'platform', key: '', model: '' }

export function CopilotSettingsPanel({
  state,
  busy,
  patch,
  session,
  setSession,
  desktop,
  onDesktopSettings,
}: {
  state: CopilotState
  busy: boolean
  patch: (change: CopilotPatch) => Promise<boolean>
  session: ModelSession
  setSession: (session: ModelSession) => void
  desktop?: DesktopStatus | null
  onDesktopSettings?: () => void
}) {
  const { settings, capabilities, memories } = state
  const [name, setName] = useState(settings.name)
  const [memoryText, setMemoryText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'history' | 'memory' | null>(null)
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
        <legend>模型连接</legend>
        <label>
          本次连接
          <select
            value={session.provider}
            onChange={(event) =>
              setSession({ provider: event.target.value as ModelSession['provider'], key: '', model: '' })
            }
          >
            <option value="platform">平台副驾</option>
            {onDesktopSettings && <option value="desktop">桌面连接</option>}
            <option value="openai">我的 OpenAI API</option>
            <option value="anthropic">我的 Anthropic API</option>
          </select>
        </label>
        {session.provider === 'desktop' ? (
          <div className="cp-desktop-connection">
            <small>
              {desktop?.enabled
                ? `${desktopProviders[desktop.provider]} · ${desktop.model}`
                : '请在本机模型设置中选择模型，并允许驾驶舱连接。'}
            </small>
            <p>本次输入和当前歌曲、星球交给所选桌面模型。桌面回复只在当前驾驶舱会话显示。</p>
            <button type="button" onClick={onDesktopSettings}>
              打开本机模型设置
            </button>
          </div>
        ) : session.provider === 'platform' ? (
          <small>{capabilities.platform ? '平台模型已连接。' : '平台模型暂不可用，仍可使用曲库检索。'}</small>
        ) : (
          <>
            <label>
              API 密钥
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={session.key}
                onChange={(event) => setSession({ ...session, key: event.target.value })}
              />
            </label>
            <label>
              模型名称（可选）
              <input
                spellCheck={false}
                value={session.model}
                placeholder="使用默认模型"
                onChange={(event) => setSession({ ...session, model: event.target.value })}
              />
            </label>
            <small>密钥仅在本次页面会话中保留，每次发送时经 Mosic 转交所选 API。</small>
            {session.key && (
              <button type="button" onClick={() => setSession(platformSession)}>
                断开我的密钥
              </button>
            )}
          </>
        )}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>个人记忆</legend>
        {session.provider === 'desktop' && <small>这些是平台副驾的记忆，桌面连接使用独立上下文。</small>}
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
      {state.messages.length > 0 && (
        <button type="button" disabled={busy} onClick={() => setConfirm('history')}>
          清空对话记录
        </button>
      )}
      {confirm && (
        <div className="cp-confirm" role="group" aria-label="确认清理">
          <p>{confirm === 'history' ? '清空全部对话记录？个人记忆会保留。' : '清空已保存的全部记忆？'}</p>
          <button
            disabled={busy}
            onClick={async () => {
              if (await patch(confirm === 'history' ? { clearHistory: true } : { memory: { action: 'clear' } })) {
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
