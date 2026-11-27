import { endpoint, bodyJson, string } from '../../../_music-copilot-state'
import { copilotFacts } from '../../../_music-copilot-facts'
import { readCopilotContext } from '../copilot'

// The desktop broker can send individual filters, keeping its private conversation on-device.
export const onRequestPost = endpoint(async (env, uid, request) => {
  const input = await bodyJson(request)
  const tags = [string(input.query, 96), string(input.genre, 60), string(input.mood, 60)]
  const search = [
    input.kind === 'planet' ? '公开星球' : '歌曲',
    input.weekly === true ? '本周榜单' : '',
    ...tags,
    typeof input.bpm === 'number' && input.bpm >= 30 && input.bpm <= 300 ? input.bpm + ' BPM' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const facts = await copilotFacts(env, uid, search, readCopilotContext(input.context), [], [])
  return { cards: facts.cards, notice: facts.detail }
})
