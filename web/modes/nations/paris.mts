// 프랑스(파리) 도시 색 · 창 · 지붕 덧쓰기: 크림 · 꿀색 석회석 벽, 키 큰 창, 아연 회청 지붕, 1층 가게는 짙은 초록 · 와인, 연한 돌길 · 플라타너스 · 센강 물.
// 건물 윤곽 · 높이는 기본 팩 그대로. 8~45 m 건물은 거의 다 망사르드 지붕 · 지붕창 · 굴뚝 · 철제 발코니 띠, 드물게 돔 기념관 · 작은 에펠탑(부품 'nation' — web/modes/nations/parts.mts).
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
     "#DDD0B5",
     "#F0E6D2",
     "#CFC2A6"
    ],
    "dark": [
     "#58544A",
     "#544F45",
     "#5B5750",
     "#4F4A3F"
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
     "#E8DCC4",
     "#F0E6D2",
     "#DDD0B5",
     "#E3D3B6"
    ],
    "dark": [
     "#58544A",
     "#5B5750",
     "#544F45",
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
     "light": "#E8DCC4",
     "dark": "#58544A"
    }
   }
  },
  "shop": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#2F4A3E",
     "#6E2E36",
     "#DDD0B5"
    ],
    "dark": [
     "#58544A",
     "#121C18",
     "#2A1115",
     "#544F45"
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
     "#E3D8C2",
     "#D6CAB0",
     "#EDE4D1",
     "#CFC2A6"
    ],
    "dark": [
     "#56524A",
     "#514D43",
     "#5A574F",
     "#4F4A3F"
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
     "#CFC4AE",
     "#C2B79F",
     "#D9CFBB",
     "#BDB29B"
    ],
    "dark": [
     "#4F4A42",
     "#4A463C",
     "#524F47",
     "#48443B"
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
     "light": "#CFC4AE",
     "dark": "#4F4A42"
    }
   }
  },
  "civic": {
   "wall": {
    "light": [
     "#EFE6D3",
     "#E3D7BE",
     "#D8CBAF",
     "#F4ECDC"
    ],
    "dark": [
     "#5B5750",
     "#565248",
     "#524D43",
     "#5D5A54"
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
     "light": "#EFE6D3",
     "dark": "#5B5750"
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
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
  "silverGlass": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
  "blueGlass": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
  "warmStone": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
  "redBrick": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
  "paintedConcrete": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
  "galvanizedMetal": {
   "wall": {
    "light": [
     "#E8DCC4",
     "#DDD0B5",
     "#F0E6D2"
    ],
    "dark": [
     "#58544A",
     "#544F45",
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
