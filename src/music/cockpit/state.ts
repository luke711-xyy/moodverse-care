export type CockpitPage = 'planet' | 'moment' | 'manage' | 'appearance' | 'orbit'
  | 'collision' | 'galaxy' | 'roam' | 'bottles' | 'visitor' | 'preflight' | 'settings' | 'moderation'
export type ExteriorDestination = 'home' | 'galaxy' | 'visitor'
export type ConsoleState = { focus: 'overview' | 'personal' | 'exploration'; page: CockpitPage }
type Origin = { exterior: ExteriorDestination; console: ConsoleState }
type TravelState = { status: 'idle' } | {
  status: 'loading' | 'arriving'; token: number; target: ExteriorDestination; origin: Origin; returning: boolean
}
export type CockpitState = {
  exterior: ExteriorDestination; console: ConsoleState; history: ConsoleState[]; travel: TravelState; origins: Origin[]
  channels: { personal: CockpitPage; exploration: CockpitPage }
}
export type CockpitAction =
  | { type: 'open'; page: CockpitPage }
  | { type: 'channel'; page: CockpitPage }
  | { type: 'overview' } | { type: 'back' } | { type: 'reset' }
  | { type: 'exterior'; destination: ExteriorDestination }
  | { type: 'depart'; token: number; target: ExteriorDestination; originConsole?: ConsoleState }
  | { type: 'ready' | 'arrive' | 'cancel' | 'return'; token: number }

export const initialCockpitState: CockpitState = {
  exterior: 'home', console: { focus: 'overview', page: 'planet' }, history: [], travel: { status: 'idle' }, origins: [],
  channels: { personal: 'planet', exploration: 'collision' },
}
export function pageTerminal(page: CockpitPage): 'personal' | 'exploration' {
  return ['planet', 'moment', 'manage', 'appearance', 'orbit'].includes(page) ? 'personal' : 'exploration'
}
export function cockpitReducer(state: CockpitState, action: CockpitAction): CockpitState {
  if (action.type === 'reset') return initialCockpitState
  if (action.type === 'channel') return state.travel.status !== 'idle' ? state : {
    ...state, channels: { ...state.channels, [pageTerminal(action.page)]: action.page },
  }
  if (action.type === 'open') {
    if (state.travel.status !== 'idle') return state
    const console: ConsoleState = { focus: pageTerminal(action.page), page: action.page }
    if (state.console.focus === console.focus && state.console.page === console.page) return state
    return { ...state, console, channels: { ...state.channels, [console.focus]: action.page }, history: [...state.history.slice(-7), state.console] }
  }
  if (action.type === 'overview') return { ...state, console: { ...state.console, focus: 'overview' }, history: [] }
  if (action.type === 'back') {
    if (state.travel.status !== 'idle') return state
    const console = state.history.at(-1) ?? { ...state.console, focus: 'overview' }
    return { ...state, console, channels: { ...state.channels, [pageTerminal(console.page)]: console.page }, history: state.history.slice(0, -1) }
  }
  if (action.type === 'exterior') return { ...state, exterior: action.destination }
  if (action.type === 'depart' || action.type === 'return') {
    if (state.travel.status !== 'idle') return state
    const origin: Origin = { exterior: state.exterior, console: action.type === 'depart' ? action.originConsole ?? state.console : state.console }
    const returning = action.type === 'return'
    const target = action.type === 'depart' ? action.target : state.origins.at(-1)?.exterior ?? 'home'
    return { ...state, console: { ...state.console, focus: 'overview' }, travel: { status: 'loading', token: action.token, origin, target, returning } }
  }
  if (state.travel.status === 'idle' || state.travel.token !== action.token) return state
  if (action.type === 'ready') return { ...state, travel: { ...state.travel, status: 'arriving' } }
  if (action.type === 'cancel') {
    const origin = state.travel.origin
    return { ...state, ...origin, channels: { ...state.channels, [pageTerminal(origin.console.page)]: origin.console.page },
      history: origin.console.page !== state.console.page ? state.history.slice(0, -1) : state.history, travel: { status: 'idle' } }
  }
  const trip = state.travel
  const returned = trip.returning ? state.origins.at(-1) : undefined
  const page = trip.target === 'visitor' ? 'visitor' : trip.target === 'galaxy' ? 'galaxy' : 'planet'
  return {
    ...state, exterior: trip.target, console: returned?.console ?? { focus: 'overview', page }, history: [],
    channels: { ...state.channels, [pageTerminal(returned?.console.page ?? page)]: returned?.console.page ?? page },
    origins: trip.returning ? state.origins.slice(0, -1) : trip.target === 'visitor' ? [...state.origins, trip.origin] : [],
    travel: { status: 'idle' },
  }
}
