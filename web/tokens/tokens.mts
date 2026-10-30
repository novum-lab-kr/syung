// 생성물 — 직접 고치지 말 것. 원본 web/tokens/tokens.json 을 고치고 node tools/tokens/make.mjs
// 앱(React Native)용: 색 · 그림자는 tokens.color[scheme] 처럼 light · dark 로 고른다. px → 수, 시간 → 밀리초, ease → cubic-bezier 네 수
export const tokens = {
  "color": {
    "light": {
      "syung": "#ffd400",
      "syungDeep": "#f2c200",
      "syungSoft": "#fff6c2",
      "syungInk": "#141414",
      "board": "#fbfaf4",
      "paper": "#fffdf6",
      "ink": "#1d1f21",
      "secondary": "#5d5a4e",
      "muted": "#8a8676",
      "rule": "#ece6cf",
      "control": "#f5f1e1",
      "selected": "#fff1a8",
      "focus": "#141414"
    },
    "dark": {
      "syung": "#ffd400",
      "syungDeep": "#f2c200",
      "syungSoft": "#fff6c2",
      "syungInk": "#141414",
      "board": "#131416",
      "paper": "#1a1c1f",
      "ink": "#f1efe6",
      "secondary": "#b9b5a6",
      "muted": "#8f8b7d",
      "rule": "#2b2d30",
      "control": "#232529",
      "selected": "rgba(255,212,0,.16)",
      "focus": "#ffd400"
    }
  },
  "font": {
    "round": "\"Jua\",\"Noto Sans KR\",\"Apple SD Gothic Neo\",sans-serif"
  },
  "text": {
    "11": 11,
    "12": 12,
    "13": 13,
    "14": 14,
    "15": 15,
    "16": 16,
    "17": 17,
    "18": 18,
    "19": 19,
    "20": 20,
    "21": 21,
    "22": 22,
    "24": 24,
    "26": 26,
    "36": 36,
    "10.5": 10.5,
    "11.5": 11.5,
    "12.5": 12.5,
    "13.5": 13.5,
    "14.5": 14.5
  },
  "weight": {
    "regular": "400",
    "medium": "500",
    "semibold": "600",
    "bold": "700",
    "extrabold": "800"
  },
  "space": {
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "7": 28,
    "12": 48
  },
  "radius": {
    "2": 2,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    "12": 12,
    "14": 14,
    "15": 15,
    "16": 16,
    "18": 18,
    "22": 22,
    "27": 27,
    "pill": 999,
    "circle": "50%"
  },
  "shadow": {
    "light": {
      "DEFAULT": "0 3px 0 rgba(20,20,20,.08),0 6px 18px rgba(60,50,0,.10)",
      "edge": "0 2px 0 rgba(20,20,20,.15)",
      "edgeChip": "0 1.5px 0 rgba(20,20,20,.25)",
      "edgeBrand": "0 3px 0 #e6c62f",
      "knob": "0 1px 3px rgba(0,0,0,.18)"
    },
    "dark": {
      "DEFAULT": "0 3px 0 rgba(0,0,0,.35),0 6px 18px rgba(0,0,0,.35)",
      "edge": "0 2px 0 rgba(20,20,20,.15)",
      "edgeChip": "0 1.5px 0 rgba(20,20,20,.25)",
      "edgeBrand": "0 3px 0 #e6c62f",
      "knob": "0 1px 3px rgba(0,0,0,.18)"
    }
  },
  "duration": {
    "120": 120,
    "150": 150,
    "160": 160,
    "180": 180,
    "200": 200,
    "220": 220,
    "250": 250,
    "260": 260,
    "600": 600,
    "1100": 1100,
    "1400": 1400
  },
  "ease": {
    "standard": [
      0.2,
      0.8,
      0.2,
      1
    ],
    "sheet": [
      0.2,
      0.8,
      0.25,
      1
    ]
  },
  "focus": {
    "width": 3,
    "widthThin": 2,
    "offset": 2
  }
} as const;

export type Tokens = typeof tokens;
