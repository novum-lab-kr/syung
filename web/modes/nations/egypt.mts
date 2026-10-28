// 이집트(카이로) 도시 색 · 창 · 지붕 덧쓰기: 사암 · 오커 · 테라코타 · 빛바랜 분홍 · 시멘트 회색 · 하늘색 벽, 모래 땅 · 마른 풀 · 대추야자 초록 · 나일 물, 작은 창.
// 건물 윤곽 · 높이는 기본 팩 그대로. 40 m 아래 건물은 거의 다 옥상 살림(난간 · 검은 물탱크 · 위성 접시 · 철근 · 비둘기집 · 그늘막), 드물게 모스크(돔 + 미나레트) · 아주 드물게 피라미드(부품 'nation' — web/modes/nations/parts.mjs).
// accent 3색 = 나라 모형의 [특색, 흰 칠 · 철, 유리 · 검은 것]. 밤은 같은 색 × 0.36. (만든 법: 기본 팩 구조를 따라 색만 바꾸는 생성기 — 2026-10-22, 시안 look3d '이집트')
export const EGYPT_DELTA = {
 "id": "egypt",
 "label": "이집트 / 카이로",
 "nation": {
  "kind": "egypt"
 },
 "ground": {
  "light": {
   "base": "#E3C995",
   "residential": "#E6CD9C",
   "commercial": "#DFC79C",
   "retail": "#E8CC98",
   "industrial": "#D2BF98",
   "civic": "#EAD3A6",
   "hospital": "#E2D2B0",
   "park": "#9EAA6B",
   "grass": "#AEB574",
   "forest": "#6F8146",
   "water": "#3E8E91",
   "sidewalk": "#EBD7AE",
   "ballast": "#B9A47E"
  },
  "dark": {
   "base": "#524836",
   "residential": "#534A38",
   "commercial": "#504838",
   "retail": "#544937",
   "industrial": "#4C4537",
   "civic": "#544C3C",
   "hospital": "#514C3F",
   "park": "#393D27",
   "grass": "#3F412A",
   "forest": "#282E19",
   "water": "#163334",
   "sidewalk": "#554D3F",
   "ballast": "#433B2D"
  }
 },
 "roads": {
  "classes": {
   "motorway": {
    "colors": {
     "light": "#8F857A",
     "dark": "#33302C"
    }
   },
   "primary": {
    "colors": {
     "light": "#9A8F83",
     "dark": "#37332F"
    }
   },
   "secondary": {
    "colors": {
     "light": "#A59A8C",
     "dark": "#3B3732"
    }
   },
   "tertiary": {
    "colors": {
     "light": "#B0A594",
     "dark": "#3F3B35"
    }
   },
   "minor": {
    "colors": {
     "light": "#BBAE9B",
     "dark": "#433F38"
    }
   },
   "service": {
    "colors": {
     "light": "#C4B7A2",
     "dark": "#47423A"
    }
   }
  },
  "lane": {
   "colors": {
    "light": "#F1E8D6",
    "dark": "#57544D"
   }
  },
  "centerLine": {
   "colors": {
    "light": "#F1E8D6",
    "dark": "#57544D"
   }
  }
 },
 "buildings": {
  "house": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B",
     "#B9B4A8"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38",
     "#43413C"
    ]
   },
   "roof": {
    "flat": {
     "light": "#D2B888",
     "dark": "#4C4231"
    },
    "variants": {
     "light": [
      "#D2B888",
      "#C6AC7E",
      "#BDB4A2",
      "#D9C49A"
     ],
     "dark": [
      "#4C4231",
      "#473E2D",
      "#44413A",
      "#4E4737"
     ]
    },
    "variantWeights": [
     0.4,
     0.25,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0,
     "colors": {
      "light": [
       "#5E9C8E",
       "#EFE9DC",
       "#3A3836"
      ],
      "dark": [
       "#223833",
       "#56544F",
       "#151413"
      ]
     }
    }
   },
   "windowRatio": [
    0.26,
    0.36
   ],
   "bayM": 3.6
  },
  "apartment": {
   "wall": {
    "light": [
     "#D6B07A",
     "#BE8F63",
     "#C9A59C",
     "#A9ABA4"
    ],
    "dark": [
     "#4D3F2C",
     "#443324",
     "#483B38",
     "#3D3E3B"
    ]
   },
   "roof": {
    "flat": {
     "light": "#D2B888",
     "dark": "#4C4231"
    },
    "variants": {
     "light": [
      "#D2B888",
      "#C6AC7E",
      "#BDB4A2",
      "#D9C49A"
     ],
     "dark": [
      "#4C4231",
      "#473E2D",
      "#44413A",
      "#4E4737"
     ]
    },
    "variantWeights": [
     0.4,
     0.25,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0,
     "colors": {
      "light": [
       "#5E9C8E",
       "#EFE9DC",
       "#3A3836"
      ],
      "dark": [
       "#223833",
       "#56544F",
       "#151413"
      ]
     }
    }
   },
   "windowRatio": [
    0.26,
    0.36
   ],
   "bayM": 3.6,
   "groundFloor": {
    "colors": {
     "light": "#D6B07A",
     "dark": "#4D3F2C"
    }
   }
  },
  "shop": {
   "wall": {
    "light": [
     "#D9B57E",
     "#7FA8B5",
     "#C99A6A",
     "#E3CDA2"
    ],
    "dark": [
     "#4E412D",
     "#2E3C41",
     "#483726",
     "#524A3A"
    ]
   },
   "roof": {
    "flat": {
     "light": "#D2B888",
     "dark": "#4C4231"
    },
    "variants": {
     "light": [
      "#D2B888",
      "#C6AC7E",
      "#BDB4A2",
      "#D9C49A"
     ],
     "dark": [
      "#4C4231",
      "#473E2D",
      "#44413A",
      "#4E4737"
     ]
    },
    "variantWeights": [
     0.4,
     0.25,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0,
     "colors": {
      "light": [
       "#5E9C8E",
       "#EFE9DC",
       "#3A3836"
      ],
      "dark": [
       "#223833",
       "#56544F",
       "#151413"
      ]
     }
    }
   },
   "windowRatio": [
    0.26,
    0.36
   ],
   "bayM": 3.6
  },
  "office": {
   "wall": {
    "light": [
     "#CBB08A",
     "#B7A58C",
     "#A9ABA4",
     "#D6B07A"
    ],
    "dark": [
     "#493F32",
     "#423B32",
     "#3D3E3B",
     "#4D3F2C"
    ]
   },
   "roof": {
    "flat": {
     "light": "#D2B888",
     "dark": "#4C4231"
    },
    "variants": {
     "light": [
      "#D2B888",
      "#C6AC7E",
      "#BDB4A2",
      "#D9C49A"
     ],
     "dark": [
      "#4C4231",
      "#473E2D",
      "#44413A",
      "#4E4737"
     ]
    },
    "variantWeights": [
     0.4,
     0.25,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0,
     "colors": {
      "light": [
       "#5E9C8E",
       "#EFE9DC",
       "#3A3836"
      ],
      "dark": [
       "#223833",
       "#56544F",
       "#151413"
      ]
     }
    }
   },
   "windowRatio": [
    0.26,
    0.36
   ],
   "bayM": 3.6
  },
  "industrial": {
   "wall": {
    "light": [
     "#B7A28A",
     "#A59580",
     "#C2AE90",
     "#9C9488"
    ],
    "dark": [
     "#423A32",
     "#3B362E",
     "#463F34",
     "#383531"
    ]
   },
   "roof": {
    "flat": {
     "light": "#D2B888",
     "dark": "#4C4231"
    },
    "variants": {
     "light": [
      "#D2B888",
      "#C6AC7E",
      "#BDB4A2",
      "#D9C49A"
     ],
     "dark": [
      "#4C4231",
      "#473E2D",
      "#44413A",
      "#4E4737"
     ]
    },
    "variantWeights": [
     0.4,
     0.25,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0,
     "colors": {
      "light": [
       "#5E9C8E",
       "#EFE9DC",
       "#3A3836"
      ],
      "dark": [
       "#223833",
       "#56544F",
       "#151413"
      ]
     }
    }
   },
   "windowRatio": [
    0.26,
    0.36
   ],
   "bayM": 3.6,
   "groundFloor": {
    "colors": {
     "light": "#B7A28A",
     "dark": "#423A32"
    }
   }
  },
  "civic": {
   "wall": {
    "light": [
     "#E3C995",
     "#D9B57E",
     "#EBD8B0",
     "#C99A6A"
    ],
    "dark": [
     "#524836",
     "#4E412D",
     "#554E3F",
     "#483726"
    ]
   },
   "roof": {
    "flat": {
     "light": "#D2B888",
     "dark": "#4C4231"
    },
    "variants": {
     "light": [
      "#D2B888",
      "#C6AC7E",
      "#BDB4A2",
      "#D9C49A"
     ],
     "dark": [
      "#4C4231",
      "#473E2D",
      "#44413A",
      "#4E4737"
     ]
    },
    "variantWeights": [
     0.4,
     0.25,
     0.2,
     0.15
    ],
    "pitched": {
     "probability": 0,
     "colors": {
      "light": [
       "#5E9C8E",
       "#EFE9DC",
       "#3A3836"
      ],
      "dark": [
       "#223833",
       "#56544F",
       "#151413"
      ]
     }
    }
   },
   "windowRatio": [
    0.26,
    0.36
   ],
   "bayM": 3.6,
   "groundFloor": {
    "colors": {
     "light": "#E3C995",
     "dark": "#524836"
    }
   }
  }
 },
 "materialFamilies": {
  "navyGlass": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "silverGlass": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "blueGlass": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "ivoryStone": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "warmStone": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "redBrick": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "paintedConcrete": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "plaster": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  },
  "galvanizedMetal": {
   "wall": {
    "light": [
     "#D9B57E",
     "#C99A6A",
     "#CFA39B"
    ],
    "dark": [
     "#4E412D",
     "#483726",
     "#4B3B38"
    ]
   },
   "glass": {
    "light": [
     "#4E4A42",
     "#5A5650",
     "#433F38"
    ],
    "dark": [
     "#1C1B18",
     "#201F1D",
     "#181714"
    ]
   },
   "roof": {
    "light": [
     "#D2B888",
     "#C6AC7E",
     "#BDB4A2"
    ],
    "dark": [
     "#4C4231",
     "#473E2D",
     "#44413A"
    ]
   },
   "facade": {
    "pattern": "punched",
    "windowRatio": [
     0.26,
     0.36
    ],
    "reflectionScale": 0.04,
    "bayM": 3.6
   }
  }
 },
 "props": {
  "trees": {
   "colors": {
    "light": [
     "#5D7A3A",
     "#6F8B44",
     "#86A052"
    ],
    "dark": [
     "#212C15",
     "#283218",
     "#303A1E"
    ]
   }
  }
 },
 "buildingDefaults": {
  "glass": {
   "light": "#4E4A42",
   "dark": "#1C1B18"
  },
  "waterproofRoof": {
   "colors": {
    "light": "#D2B888",
    "dark": "#4C4231"
   }
  },
  "equipment": {
   "colors": {
    "light": "#3A3836",
    "dark": "#151413"
   }
  }
 }
};
