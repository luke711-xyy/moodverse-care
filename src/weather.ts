import type { MoodId, WeatherId } from './types'

export type WeatherFeatures = {
  clouds: number
  cloudSpeed: number
  wind: number
  rain: number
  snow: number
  sunshine: number
  lightning: number
}

export type WeatherDefinition = {
  label: string
  description: string
  accent: string
  features: WeatherFeatures
}

export const WEATHER_CATALOG: Record<WeatherId, WeatherDefinition> = {
  golden_breeze: { label: '金色微风', description: '晴光轻轻铺开，风沿着地表流动。', accent: '#e4c77e', features: { clouds: .14, cloudSpeed: .34, wind: .32, rain: 0, snow: 0, sunshine: .94, lightning: .01 } },
  updraft: { label: '上升气流', description: '薄云被向上托起，光线有了前进感。', accent: '#9dd6e2', features: { clouds: .3, cloudSpeed: .58, wind: .62, rain: .04, snow: 0, sunshine: .75, lightning: .02 } },
  misty_clear: { label: '薄雾晴', description: '低速薄雾与柔和日照并存。', accent: '#afd8d4', features: { clouds: .22, cloudSpeed: .12, wind: .14, rain: .02, snow: 0, sunshine: .68, lightning: .01 } },
  light_rain: { label: '轻雨', description: '细雨落在海面与山脊。', accent: '#8dbbd6', features: { clouds: .84, cloudSpeed: .28, wind: .2, rain: .84, snow: .12, sunshine: .05, lightning: .04 } },
  charged_cloud: { label: '电离云', description: '云层快速流动，远处有微弱电光。', accent: '#b5a4d9', features: { clouds: .82, cloudSpeed: .88, wind: .94, rain: .38, snow: 0, sunshine: .08, lightning: .92 } },
  low_light: { label: '低照度', description: '厚云缓慢移动，地表光线安静下来。', accent: '#9da8bd', features: { clouds: .91, cloudSpeed: .08, wind: .06, rain: .16, snow: .62, sunshine: .03, lightning: .01 } },
  sunny: { label: '晴天', description: '云层稀薄，清晰的日照落在地表。', accent: '#e7d69b', features: { clouds: .06, cloudSpeed: .18, wind: .12, rain: 0, snow: 0, sunshine: .98, lightning: 0 } },
  overcast: { label: '阴天', description: '云层较密，仍有柔和的环境光。', accent: '#aebbc6', features: { clouds: .82, cloudSpeed: .14, wind: .12, rain: .03, snow: 0, sunshine: .2, lightning: .01 } },
  persistent_rain: { label: '连绵雨', description: '雨带持续经过，水面留下缓慢回响。', accent: '#789db6', features: { clouds: .94, cloudSpeed: .2, wind: .18, rain: .78, snow: .02, sunshine: .04, lightning: .02 } },
  showers: { label: '阵雨', description: '短暂的雨带掠过，云隙间仍有亮光。', accent: '#93bdd4', features: { clouds: .68, cloudSpeed: .66, wind: .4, rain: .58, snow: 0, sunshine: .36, lightning: .06 } },
  distant_thunder: { label: '远雷', description: '远方云层有一瞬微光，很快隐入夜色。', accent: '#aaa5c6', features: { clouds: .68, cloudSpeed: .46, wind: .4, rain: .18, snow: 0, sunshine: .18, lightning: .3 } },
  snow: { label: '飘雪', description: '轻雪掠过高处，雪线随星球冷暖慢慢变化。', accent: '#d1e1e8', features: { clouds: .78, cloudSpeed: .22, wind: .32, rain: .02, snow: .72, sunshine: .18, lightning: .01 } },
  strong_wind: { label: '强风', description: '风带动云层与枝叶，方向清晰而克制。', accent: '#9bbfc5', features: { clouds: .4, cloudSpeed: .84, wind: .9, rain: .08, snow: 0, sunshine: .4, lightning: .02 } },
  clearing: { label: '雨后放晴', description: '云层逐步散开，先前的水位仍在缓慢回落。', accent: '#acd7c4', features: { clouds: .34, cloudSpeed: .42, wind: .28, rain: .08, snow: 0, sunshine: .8, lightning: .01 } },
  night_glow: { label: '夜雾微光', description: '深色薄雾围着稀疏微光，远处轮廓仍可辨认。', accent: '#9aa8c0', features: { clouds: .42, cloudSpeed: .08, wind: .04, rain: .01, snow: 0, sunshine: .08, lightning: 0 } },
  thunderstorm: { label: '雷暴', description: '厚云与短暂电光交替出现，不在地表留下伤痕。', accent: '#a5a1be', features: { clouds: .94, cloudSpeed: .72, wind: .72, rain: .62, snow: 0, sunshine: .05, lightning: .7 } },
  typhoon: { label: '台风', description: '高空云带快速盘旋，风雨效果有明确上限。', accent: '#93abb0', features: { clouds: .94, cloudSpeed: .92, wind: .96, rain: .78, snow: 0, sunshine: .03, lightning: .28 } },
  hail: { label: '冰雹', description: '短时冰粒落下，地表与植被不保留损伤状态。', accent: '#bdc9d1', features: { clouds: .84, cloudSpeed: .68, wind: .52, rain: .3, snow: .54, sunshine: .12, lightning: .24 } },
  cloudy: { label: '多云', description: '云朵疏密交错，光线在地表缓慢移动。', accent: '#b4c4c4', features: { clouds: .52, cloudSpeed: .24, wind: .18, rain: .01, snow: 0, sunshine: .54, lightning: .01 } },
  sandstorm: { label: '沙尘暴', description: '远处浮尘带降低能见度，星球主体保持清晰。', accent: '#b8a991', features: { clouds: .48, cloudSpeed: .86, wind: .88, rain: 0, snow: 0, sunshine: .32, lightning: .01 } },
}

const MOOD_WEATHER_CHOICES: Record<MoodId, WeatherId[]> = {
  joy: ['golden_breeze', 'sunny', 'updraft', 'cloudy'],
  hope: ['updraft', 'clearing', 'sunny', 'golden_breeze'],
  calm: ['misty_clear', 'cloudy', 'night_glow', 'sunny'],
  sad: ['light_rain', 'overcast', 'persistent_rain', 'showers'],
  anxious: ['charged_cloud', 'distant_thunder', 'strong_wind', 'overcast'],
  tired: ['low_light', 'night_glow', 'misty_clear', 'overcast'],
  irritable: ['strong_wind', 'showers', 'cloudy', 'overcast'],
  anger: ['strong_wind', 'distant_thunder', 'showers', 'overcast'],
  lonely: ['night_glow', 'overcast', 'misty_clear', 'light_rain'],
  hurt: ['light_rain', 'showers', 'overcast', 'misty_clear'],
  confused: ['misty_clear', 'cloudy', 'night_glow', 'overcast'],
  relieved: ['clearing', 'sunny', 'golden_breeze', 'cloudy'],
  grateful: ['golden_breeze', 'sunny', 'light_rain', 'clearing'],
  content: ['sunny', 'misty_clear', 'cloudy', 'golden_breeze'],
  numb: ['low_light', 'night_glow', 'overcast', 'misty_clear'],
  fear: ['charged_cloud', 'distant_thunder', 'night_glow', 'strong_wind'],
  proud: ['updraft', 'golden_breeze', 'sunny', 'clearing'],
  unnamed: ['misty_clear', 'cloudy', 'night_glow', 'golden_breeze'],
}

function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return hash >>> 0
}

export function resolveWeatherId(planetId: string, date: string, mood: MoodId): WeatherId {
  const seed = hash32(`${planetId}:${date}:${mood}:weather`)
  const roll = seed % 1000

  // Rare weather is a visual variation, never an intensity/severity judgment.
  if (mood === 'anxious' && roll < 18) return 'typhoon'
  if (['anxious', 'anger', 'fear'].includes(mood) && roll < 72) return 'thunderstorm'
  if (['anger', 'fear'].includes(mood) && roll >= 72 && roll < 112) return 'hail'
  if (['irritable', 'confused'].includes(mood) && roll < 76) return 'sandstorm'

  if (mood === 'tired') {
    const coldness = .38 + (hash32(`${planetId}:biome-temperature`) / 0xffff_ffff) * .58
    if (coldness > .72 && roll < 260) return 'snow'
  }

  const choices = MOOD_WEATHER_CHOICES[mood]
  return choices[(seed >>> 10) % choices.length]
}

export const weatherLabel = (weather: WeatherId) => WEATHER_CATALOG[weather].label
export const weatherAccent = (weather: WeatherId) => WEATHER_CATALOG[weather].accent
