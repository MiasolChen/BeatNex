import type { DrumId } from '../pattern/types'

export const BOOM_BAP_LESSONS: readonly { name: string; goal: string; targets: DrumId[] }[] = [
  {
    "name": "Foundation Backbeat",
    "goal": "稳定一、三拍重心，抓住二、四拍后拍。",
    "targets": [
      "kick",
      "snare"
    ]
  },
  {
    "name": "Pocket Swing",
    "goal": "在直网格上听辨切分与 Hat 疏密，保持 Pocket。",
    "targets": [
      "kick",
      "closedHat"
    ]
  },
  {
    "name": "Syncopated Break",
    "goal": "跟住反拍 Kick，在断句后回到一拍。",
    "targets": [
      "kick"
    ]
  },
  {
    "name": "Kick Conversation",
    "goal": "分辨 Kick 前后半句的呼应，保持重心。",
    "targets": [
      "kick"
    ]
  },
  {
    "name": "Ghost Backbeat",
    "goal": "分清 Snare 主后拍与轻击，不把轻击跳成重拍。",
    "targets": [
      "snare"
    ]
  },
  {
    "name": "Hat Accents",
    "goal": "保持 Hat 细分，分辨重音与轻音。",
    "targets": [
      "closedHat"
    ]
  },
  {
    "name": "Open Hat Release",
    "goal": "听清开镲释放与闭镲截断，练习动作收放。",
    "targets": [
      "closedHat",
      "openHat"
    ]
  },
  {
    "name": "Silence Return",
    "goal": "在句尾留白中保持内拍，下一小节准确回到一拍。",
    "targets": [
      "kick",
      "snare"
    ]
  }
]
