// 프랑스(파리) 도시 색 · 창 · 지붕 덧쓰기: 크림 · 꿀색 석회석 벽, 키 큰 창, 아연 회청 지붕, 1층 가게는 짙은 초록 · 와인, 연한 돌길 · 플라타너스 · 센강 물.
// 벽색 팔레트 12가지 — 재질 묶음마다 다른 세 색, 건물 종류마다 다른 네 색(덕배 2026-10-23: 그 나라 건물색이 하나일 리 없다).
// 건물 윤곽 · 높이는 기본 팩 그대로. 8~45 m 건물은 거의 다 망사르드 지붕 · 지붕창 · 굴뚝 · 철제 발코니 띠, 드물게 돔 기념관 · 작은 에펠탑(부품 'nation' — web/modes/nations/parts.mjs).
// accent 3색 = 나라 모형의 [특색, 흰 칠 · 철, 유리 · 검은 것]. 밤은 같은 색 × 0.38. (만든 법: 기본 팩 구조를 따라 색만 바꾸는 생성기 — 2026-10-22, 시안 look3d '파리')
export const PARIS_DELTA = {
 "id": "paris",
 "label": "프랑스 / 파리",
 "nation": {
  "kind": "paris"
 },
 "ground": {
  "light": {
   "base": "#D9D3C4",
   "residential": "#DDD6C6",
   "commercial": "#D6CFBF",
   "retail": "#DED5C2",
   "industrial": "#CCC7BC",
   "civic": "#E2DBCB",
   "hospital": "#DCD8CD",
   "park": "#9DB07A",
   "grass": "#A8BA82",
   "forest": "#6E8B55",
   "water": "#5E8C96",
   "sidewalk": "#E3DDCF",
   "ballast": "#A9A49A"
  },
  "dark": {
   "base": "#52504A",
   "residential": "#54514B",
   "commercial": "#514F49",
   "retail": "#54514A",
   "industrial": "#4E4C47",
   "civic": "#56534D",
   "hospital": "#54524E",
   "park": "#3C432E",
   "grass": "#404731",
   "forest": "#2A3520",
   "water": "#243539",
   "sidewalk": "#56544F",
   "ballast": "#403E3B"
  }
 },
 "roads": {
  "classes": {
   "motorway": {
    "colors": {
     "light": "#7D7F80",
     "dark": "#303031"
    }
   },
   "primary": {
    "colors": {
     "light": "#878988",
     "dark": "#333434"
    }
   },
   "secondary": {
    "colors": {
     "light": "#919392",
     "dark": "#373837"
    }
   },
   "tertiary": {
    "colors": {
     "light": "#9C9D9B",
     "dark": "#3B3C3B"
    }
   },
   "minor": {
    "colors": {
     "light": "#A7A7A3",
     "dark": "#3F3F3E"
    }
   },
   "service": {
    "colors": {
     "light": "#B1B0AB",
     "dark": "#434341"
    }
   }
  },
  "lane": {
   "colors": {
    "light": "#EDEBE4",
    "dark": "#5A5957"
   }
  },
  "centerLine": {
   "colors": {
    "light": "#EDEBE4",
    "dark": "#5A5957"
   }
  }
 },
 "buildings": {
  "house": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#BFB4A0",
     "#CFC2A6",
     "#C8BBA0"
    ],
    "dark": [
     "#58544A",
     "#49443D",
     "#4F4A3F",
     "#4C473D"
    ]
   },
   "roof": {
    "flat": {
     "light": "#7C8C97",
     "dark": "#2F3539"
    },
    "variants": {
     "light": [
      "#7C8C97",
      "#6E7F8C",
      "#8A99A2",
      "#5F707C"
     ],
     "dark": [
      "#2F3539",
      "#2A3035",
      "#343A3E",
      "#242B2F"
     ]
    },
    "variantWeights": [
     0.35,
     0.3,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0.1,
     "colors": {
      "light": [
       "#6E7F8C",
       "#2B2F33",
       "#3F4F57"
      ],
      "dark": [
       "#2A3035",
       "#101213",
       "#181E21"
      ]
     }
    }
   },
   "windowRatio": [
    0.5,
    0.7
   ],
   "bayM": 3.2
  },
  "apartment": {
   "wall": {
    "light": [
     "#EDE4D1",
     "#F2EADB",
     "#D6CAB0",
     "#F0E6D2"
    ],
    "dark": [
     "#5A574F",
     "#5C5953",
     "#514D43",
     "#5B5750"
    ]
   },
   "roof": {
    "flat": {
     "light": "#7C8C97",
     "dark": "#2F3539"
    },
    "variants": {
     "light": [
      "#7C8C97",
      "#6E7F8C",
      "#8A99A2",
      "#5F707C"
     ],
     "dark": [
      "#2F3539",
      "#2A3035",
      "#343A3E",
      "#242B2F"
     ]
    },
    "variantWeights": [
     0.35,
     0.3,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0.1,
     "colors": {
      "light": [
       "#6E7F8C",
       "#2B2F33",
       "#3F4F57"
      ],
      "dark": [
       "#2A3035",
       "#101213",
       "#181E21"
      ]
     }
    }
   },
   "windowRatio": [
    0.5,
    0.7
   ],
   "bayM": 3.2,
   "groundFloor": {
    "colors": {
     "light": "#EDE4D1",
     "dark": "#5A574F"
    }
   }
  },
  "shop": {
   "wall": {
    "light": [
     "#E3D3B6",
     "#D9C9A6",
     "#DDD0B5",
     "#E6D8BC"
    ],
    "dark": [
     "#565045",
     "#524C3F",
     "#544F45",
     "#575247"
    ]
   },
   "roof": {
    "flat": {
     "light": "#7C8C97",
     "dark": "#2F3539"
    },
    "variants": {
     "light": [
      "#7C8C97",
      "#6E7F8C",
      "#8A99A2",
      "#5F707C"
     ],
     "dark": [
      "#2F3539",
      "#2A3035",
      "#343A3E",
      "#242B2F"
     ]
    },
    "variantWeights": [
     0.35,
     0.3,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0.1,
     "colors": {
      "light": [
       "#6E7F8C",
       "#2B2F33",
       "#3F4F57"
      ],
      "dark": [
       "#2A3035",
       "#101213",
       "#181E21"
      ]
     }
    }
   },
   "windowRatio": [
    0.5,
    0.7
   ],
   "bayM": 3.2
  },
  "office": {
   "wall": {
    "light": [
     "#BFB4A0",
     "#CFC2A6",
     "#C8BBA0",
     "#E8DCC4"
    ],
    "dark": [
     "#49443D",
     "#4F4A3F",
     "#4C473D",
     "#58544A"
    ]
   },
   "roof": {
    "flat": {
     "light": "#7C8C97",
     "dark": "#2F3539"
    },
    "variants": {
     "light": [
      "#7C8C97",
      "#6E7F8C",
      "#8A99A2",
      "#5F707C"
     ],
     "dark": [
      "#2F3539",
      "#2A3035",
      "#343A3E",
      "#242B2F"
     ]
    },
    "variantWeights": [
     0.35,
     0.3,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0.1,
     "colors": {
      "light": [
       "#6E7F8C",
       "#2B2F33",
       "#3F4F57"
      ],
      "dark": [
       "#2A3035",
       "#101213",
       "#181E21"
      ]
     }
    }
   },
   "windowRatio": [
    0.5,
    0.7
   ],
   "bayM": 3.2
  },
  "industrial": {
   "wall": {
    "light": [
     "#F2EADB",
     "#D6CAB0",
     "#F0E6D2",
     "#EDE4D1"
    ],
    "dark": [
     "#5C5953",
     "#514D43",
     "#5B5750",
     "#5A574F"
    ]
   },
   "roof": {
    "flat": {
     "light": "#7C8C97",
     "dark": "#2F3539"
    },
    "variants": {
     "light": [
      "#7C8C97",
      "#6E7F8C",
      "#8A99A2",
      "#5F707C"
     ],
     "dark": [
      "#2F3539",
      "#2A3035",
      "#343A3E",
      "#242B2F"
     ]
    },
    "variantWeights": [
     0.35,
     0.3,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0.1,
     "colors": {
      "light": [
       "#6E7F8C",
       "#2B2F33",
       "#3F4F57"
      ],
      "dark": [
       "#2A3035",
       "#101213",
       "#181E21"
      ]
     }
    }
   },
   "windowRatio": [
    0.5,
    0.7
   ],
   "bayM": 3.2,
   "groundFloor": {
    "colors": {
     "light": "#F2EADB",
     "dark": "#5C5953"
    }
   }
  },
  "civic": {
   "wall": {
    "light": [
     "#D9C9A6",
     "#DDD0B5",
     "#E6D8BC",
     "#E3D3B6"
    ],
    "dark": [
     "#524C3F",
     "#544F45",
     "#575247",
     "#565045"
    ]
   },
   "roof": {
    "flat": {
     "light": "#7C8C97",
     "dark": "#2F3539"
    },
    "variants": {
     "light": [
      "#7C8C97",
      "#6E7F8C",
      "#8A99A2",
      "#5F707C"
     ],
     "dark": [
      "#2F3539",
      "#2A3035",
      "#343A3E",
      "#242B2F"
     ]
    },
    "variantWeights": [
     0.35,
     0.3,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0.1,
     "colors": {
      "light": [
       "#6E7F8C",
       "#2B2F33",
       "#3F4F57"
      ],
      "dark": [
       "#2A3035",
       "#101213",
       "#181E21"
      ]
     }
    }
   },
   "windowRatio": [
    0.5,
    0.7
   ],
   "bayM": 3.2,
   "groundFloor": {
    "colors": {
     "light": "#D9C9A6",
     "dark": "#524C3F"
    }
   }
  }
 },
 "materialFamilies": {
  "navyGlass": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F2EADB"
    ],
    "dark": [
     "#58544A",
     "#544F45",
     "#5C5953"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "silverGlass": {
   "wall": {
    "light": [
     "#BFB4A0",
     "#E6D8BC",
     "#D6CAB0"
    ],
    "dark": [
     "#49443D",
     "#575247",
     "#514D43"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "blueGlass": {
   "wall": {
    "light": [
     "#CFC2A6",
     "#E3D3B6",
     "#F0E6D2"
    ],
    "dark": [
     "#4F4A3F",
     "#565045",
     "#5B5750"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "ivoryStone": {
   "wall": {
    "light": [
     "#C8BBA0",
     "#D9C9A6",
     "#EDE4D1"
    ],
    "dark": [
     "#4C473D",
     "#524C3F",
     "#5A574F"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "warmStone": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F2EADB"
    ],
    "dark": [
     "#58544A",
     "#544F45",
     "#5C5953"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "redBrick": {
   "wall": {
    "light": [
     "#BFB4A0",
     "#E6D8BC",
     "#D6CAB0"
    ],
    "dark": [
     "#49443D",
     "#575247",
     "#514D43"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "paintedConcrete": {
   "wall": {
    "light": [
     "#CFC2A6",
     "#E3D3B6",
     "#F0E6D2"
    ],
    "dark": [
     "#4F4A3F",
     "#565045",
     "#5B5750"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "plaster": {
   "wall": {
    "light": [
     "#C8BBA0",
     "#D9C9A6",
     "#EDE4D1"
    ],
    "dark": [
     "#4C473D",
     "#524C3F",
     "#5A574F"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  },
  "galvanizedMetal": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F2EADB"
    ],
    "dark": [
     "#58544A",
     "#544F45",
     "#5C5953"
    ]
   },
   "glass": {
    "light": [
     "#3F4F57",
     "#4A5B63",
     "#35434A"
    ],
    "dark": [
     "#181E21",
     "#1C2326",
     "#14191C"
    ]
   },
   "roof": {
    "light": [
     "#7C8C97",
     "#6E7F8C",
     "#8A99A2"
    ],
    "dark": [
     "#2F3539",
     "#2A3035",
     "#343A3E"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.5,
     0.7
    ],
    "reflectionScale": 0.08,
    "bayM": 3.2
   }
  }
 },
 "props": {
  "trees": {
   "colors": {
    "light": [
     "#6E8F4E",
     "#86A35E",
     "#5A7A42"
    ],
    "dark": [
     "#2A361E",
     "#333E24",
     "#222E19"
    ]
   }
  }
 },
 "buildingDefaults": {
  "glass": {
   "light": "#3F4F57",
   "dark": "#181E21"
  },
  "waterproofRoof": {
   "colors": {
    "light": "#7C8C97",
    "dark": "#2F3539"
   }
  },
  "equipment": {
   "colors": {
    "light": "#7C8C97",
    "dark": "#2F3539"
   }
  }
 }
};
