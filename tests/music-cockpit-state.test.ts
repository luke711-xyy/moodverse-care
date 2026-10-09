import { expect, test } from 'vitest'
import { cockpitReducer, initialCockpitState } from '../src/music/cockpit/state'

test('opening terminals and settings never changes the outside destination', () => {
  let state = cockpitReducer(initialCockpitState, { type: 'exterior', destination: 'galaxy' })
  state = cockpitReducer(state, { type: 'open', page: 'orbit' })
  expect(state.exterior).toBe('galaxy')
  expect(state.console).toEqual({ focus: 'personal', page: 'orbit' })
  state = cockpitReducer(state, { type: 'open', page: 'settings' })
  expect(state.exterior).toBe('galaxy')
  expect(state.console).toEqual({ focus: 'exploration', page: 'settings' })
  state = cockpitReducer(state, { type: 'back' })
  expect(state.console).toEqual({ focus: 'personal', page: 'orbit' })
  state = cockpitReducer(state, { type: 'back' })
  expect(state.console.focus).toBe('overview')
  expect(state.exterior).toBe('galaxy')
})

test('travel retains its source and ignores cancelled or stale arrival results', () => {
  const source = cockpitReducer(initialCockpitState, { type: 'open', page: 'roam' })
  let state = cockpitReducer(source, { type: 'depart', token: 10, target: 'visitor' })
  expect(state.console.focus).toBe('overview')
  expect(state.travel.status).toBe('loading')
  expect(cockpitReducer(state, { type: 'arrive', token: 9 })).toBe(state)
  state = cockpitReducer(state, { type: 'cancel', token: 10 })
  expect(state.console).toEqual({ focus: 'exploration', page: 'roam' })
  expect(state.exterior).toBe('galaxy')
  expect(cockpitReducer(state, { type: 'arrive', token: 10 })).toBe(state)
})

test('arrival stays in overview and visitor return restores the originating terminal', () => {
  let state = cockpitReducer(initialCockpitState, { type: 'open', page: 'collision' })
  state = cockpitReducer(state, { type: 'depart', token: 1, target: 'visitor' })
  state = cockpitReducer(state, { type: 'arrive', token: 1 })
  expect(state.exterior).toBe('visitor')
  expect(state.console).toEqual({ focus: 'overview', page: 'visitor' })
  state = cockpitReducer(state, { type: 'return', token: 2 })
  state = cockpitReducer(state, { type: 'arrive', token: 2 })
  expect(state.exterior).toBe('galaxy')
  expect(state.console).toEqual({ focus: 'exploration', page: 'collision' })
})

test('reset discards account-scoped destination and return history', () => {
  let state = cockpitReducer(initialCockpitState, { type: 'open', page: 'bottles' })
  state = cockpitReducer(state, { type: 'depart', token: 3, target: 'visitor' })
  expect(cockpitReducer(state, { type: 'reset' })).toEqual(initialCockpitState)
})

test('both monitors remember their last channel independently', () => {
  let state = cockpitReducer(initialCockpitState, { type: 'open', page: 'orbit' })
  state = cockpitReducer(state, { type: 'open', page: 'bottles' })
  state = cockpitReducer(state, { type: 'overview' })
  expect(state.channels).toEqual({ personal: 'orbit', exploration: 'bottles' })
})

test('cancelled preflight restores the originating channel instead of reopening an empty confirmation', () => {
  let state = cockpitReducer(initialCockpitState, { type: 'open', page: 'collision' })
  const origin = state.console
  state = cockpitReducer(state, { type: 'open', page: 'preflight' })
  state = cockpitReducer(state, { type: 'depart', token: 1, target: 'visitor', originConsole: origin })
  state = cockpitReducer(state, { type: 'cancel', token: 1 })
  expect(state.channels.exploration).toBe('collision')
  state = cockpitReducer(state, { type: 'overview' })
  state = cockpitReducer(state, { type: 'open', page: state.channels.exploration })
  expect(state.console.page).toBe('collision')
})
