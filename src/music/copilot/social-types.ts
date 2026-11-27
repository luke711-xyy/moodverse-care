import type { MusicTrackSummary } from '../../music-domain'

export type IntroductionMode = 'recommend' | 'confirm' | 'auto'
export type PublicIntroduction = {
  mode: IntroductionMode
  trackId: string | null
  introduction: string
  greeting: string
}
export type IntroductionCard = {
  id: string
  status: 'pending' | 'delivered'
  needsApproval: boolean
  peerName: string
  planetId: string
  common: string
  offered: MusicTrackSummary
  received: MusicTrackSummary
  messages: { speaker: string; text: string; source?: 'platform' | 'rules' }[]
}
export type SocialChannel = {
  profile: PublicIntroduction
  tracks: MusicTrackSummary[]
  moments: { id: string; text: string; trackId: string }[]
  suggestions: { planetId: string; peerName: string; common: string }[]
  cards: IntroductionCard[]
  pauses: { id: string; name: string; kind: 'mute' | 'decline' }[]
}
