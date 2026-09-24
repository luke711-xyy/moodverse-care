import { expect, test } from 'vitest'
import { matchCareTemplate } from '../care-templates'

test('care copy responds to the recorded mood, intensity, theme and trigger', () => {
  const studyAnxiety = matchCareTemplate({
    mood: 'anxious', theme: 'study', intensity: 5, triggers: ['模拟考试'],
  })
  const calmPhotography = matchCareTemplate({
    mood: 'calm', theme: 'lens', intensity: 2, triggers: [],
  })

  expect(studyAnxiety.title).toContain('眼前')
  expect(studyAnxiety.message).toContain('模拟考试')
  expect(studyAnxiety.action).toContain('呼气')
  expect(calmPhotography.title).toContain('安静')
  expect(calmPhotography.action).toContain('光线')
  expect(calmPhotography).not.toEqual(studyAnxiety)
})

test('care template always returns bounded, non-empty fields for every supported mood', () => {
  const moods = ['joy', 'hope', 'calm', 'sad', 'anxious', 'tired', 'irritable', 'anger', 'lonely', 'hurt', 'confused', 'relieved', 'grateful', 'content', 'numb', 'fear', 'proud', 'unnamed']
  for (const mood of moods) {
    const copy = matchCareTemplate({ mood, theme: 'care', intensity: 4, triggers: [] })
    expect(copy.title.length).toBeGreaterThan(0)
    expect(copy.title.length).toBeLessThanOrEqual(80)
    expect(copy.message.length).toBeLessThanOrEqual(260)
    expect(copy.action.length).toBeGreaterThan(0)
    expect(copy.action.length).toBeLessThanOrEqual(140)
  }
})
