// 레트로 도시 색 · 지붕 덧쓰기(16비트 RPG 마을 + 아이소메트릭 거리): 잔디 땅 · 아스팔트 길 · 따뜻한 벽 · 기와 지붕, 네모난 낮은 건물은 거의 다 경사 지붕.
// 건물 윤곽 · 치수는 기본 팩 그대로. 색은 Endesga 32 안에서 골랐다(도트 후처리가 다시 이 색표로 맞춘다), 밤은 같은 색 × 0.42.
// 창 무늬는 도트 2~3칸보다 작으면 그리지 않는다(windowCellMinPx — 낮은 해상도에서 지글거리는 노이즈가 됐다). 유리는 짙은 파랑.
// (만든 법: 기본 팩 구조를 따라 색만 바꾸는 작은 스크립트 — 2026-10-22, 시안 look3d '레트로')
export const RETRO_DELTA = {
 "id": "retro",
 "label": "레트로 / 16비트 마을",
 "ground": {
  "light": {
   "base": "#63C74D",
   "residential": "#63C74D",
   "commercial": "#C0CBDC",
   "retail": "#E8B796",
   "industrial": "#8B9BB4",
   "civic": "#EAD4AA",
   "hospital": "#C0CBDC",
   "park": "#63C74D",
   "grass": "#63C74D",
   "forest": "#3E8948",
   "water": "#0099DB",
   "sidewalk": "#C0CBDC",
   "ballast": "#5A6988"
  },
  "dark": {
   "base": "#2a5420",
   "residential": "#2a5420",
   "commercial": "#51555c",
   "retail": "#614d3f",
   "industrial": "#3a414c",
   "civic": "#625947",
   "hospital": "#51555c",
   "park": "#2a5420",
   "grass": "#2a5420",
   "forest": "#1a3a1e",
   "water": "#00405c",
   "sidewalk": "#51555c",
   "ballast": "#262c39"
  }
 },
 "roads": {
  "classes": {
   "motorway": {
    "colors": {
     "light": "#3A4466",
     "dark": "#181d2b"
    }
   },
   "primary": {
    "colors": {
     "light": "#3A4466",
     "dark": "#181d2b"
    }
   },
   "secondary": {
    "colors": {
     "light": "#5A6988",
     "dark": "#262c39"
    }
   },
   "tertiary": {
    "colors": {
     "light": "#5A6988",
     "dark": "#262c39"
    }
   },
   "minor": {
    "colors": {
     "light": "#8B9BB4",
     "dark": "#3a414c"
    }
   },
   "service": {
    "colors": {
     "light": "#8B9BB4",
     "dark": "#3a414c"
    }
   }
  },
  "lane": {
   "colors": {
    "light": "#FFFFFF",
    "dark": "#6b6b6b"
   }
  },
  "centerLine": {
   "colors": {
    "light": "#FFFFFF",
    "dark": "#6b6b6b"
   }
  }
 },
 "buildings": {
  "house": {
   "wall": {
    "light": [
     "#E8B796",
     "#EAD4AA",
     "#C28569",
     "#FFFFFF"
    ],
    "dark": [
     "#614d3f",
     "#625947",
     "#51382c",
     "#6b6b6b"
    ]
   },
   "roof": {
    "flat": {
     "light": "#BE4A2F",
     "dark": "#501f14"
    },
    "variants": {
     "light": [
      "#BE4A2F",
      "#A22633",
      "#733E39",
      "#124E89"
     ],
     "dark": [
      "#501f14",
      "#441015",
      "#301a18",
      "#08213a"
     ]
    },
    "pitched": {
     "probability": 0.9,
     "maxHeightM": 24,
     "areaM2": [
      30,
      1400
     ],
     "riseMaxM": 5,
     "riseHeightRatio": 0.35,
     "colors": {
      "light": [
       "#BE4A2F",
       "#A22633",
       "#124E89"
      ],
      "dark": [
       "#501f14",
       "#441015",
       "#08213a"
      ]
     },
     "weights": [
      0.5,
      0.3,
      0.2
     ]
    }
   }
  },
  "apartment": {
   "wall": {
    "light": [
     "#EAD4AA",
     "#FFFFFF",
     "#E4A672",
     "#C0CBDC"
    ],
    "dark": [
     "#625947",
     "#6b6b6b",
     "#604630",
     "#51555c"
    ]
   },
   "roof": {
    "flat": {
     "light": "#A22633",
     "dark": "#441015"
    },
    "variants": {
     "light": [
      "#BE4A2F",
      "#A22633",
      "#733E39",
      "#124E89"
     ],
     "dark": [
      "#501f14",
      "#441015",
      "#301a18",
      "#08213a"
     ]
    },
    "pitched": {
     "probability": 0.9,
     "maxHeightM": 24,
     "areaM2": [
      30,
      1400
     ],
     "riseMaxM": 5,
     "riseHeightRatio": 0.35,
     "colors": {
      "light": [
       "#BE4A2F",
       "#A22633",
       "#124E89"
      ],
      "dark": [
       "#501f14",
       "#441015",
       "#08213a"
      ]
     },
     "weights": [
      0.5,
      0.3,
      0.2
     ]
    }
   },
   "groundFloor": {
    "colors": {
     "light": "#EAD4AA",
     "dark": "#625947"
    }
   }
  },
  "shop": {
   "wall": {
    "light": [
     "#E43B44",
     "#0099DB",
     "#63C74D",
     "#EAD4AA"
    ],
    "dark": [
     "#60191d",
     "#00405c",
     "#2a5420",
     "#625947"
    ]
   },
   "roof": {
    "flat": {
     "light": "#733E39",
     "dark": "#301a18"
    },
    "variants": {
     "light": [
      "#BE4A2F",
      "#A22633",
      "#733E39",
      "#124E89"
     ],
     "dark": [
      "#501f14",
      "#441015",
      "#301a18",
      "#08213a"
     ]
    },
    "pitched": {
     "probability": 0.9,
     "maxHeightM": 24,
     "areaM2": [
      30,
      1400
     ],
     "riseMaxM": 5,
     "riseHeightRatio": 0.35,
     "colors": {
      "light": [
       "#BE4A2F",
       "#A22633",
       "#124E89"
      ],
      "dark": [
       "#501f14",
       "#441015",
       "#08213a"
      ]
     },
     "weights": [
      0.5,
      0.3,
      0.2
     ]
    }
   }
  },
  "office": {
   "wall": {
    "light": [
     "#C0CBDC",
     "#8B9BB4",
     "#EAD4AA",
     "#FFFFFF"
    ],
    "dark": [
     "#51555c",
     "#3a414c",
     "#625947",
     "#6b6b6b"
    ]
   },
   "roof": {
    "flat": {
     "light": "#124E89",
     "dark": "#08213a"
    },
    "variants": {
     "light": [
      "#BE4A2F",
      "#A22633",
      "#733E39",
      "#124E89"
     ],
     "dark": [
      "#501f14",
      "#441015",
      "#301a18",
      "#08213a"
     ]
    },
    "pitched": {
     "probability": 0.9,
     "maxHeightM": 24,
     "areaM2": [
      30,
      1400
     ],
     "riseMaxM": 5,
     "riseHeightRatio": 0.35,
     "colors": {
      "light": [
       "#BE4A2F",
       "#A22633",
       "#124E89"
      ],
      "dark": [
       "#501f14",
       "#441015",
       "#08213a"
      ]
     },
     "weights": [
      0.5,
      0.3,
      0.2
     ]
    }
   }
  },
  "industrial": {
   "wall": {
    "light": [
     "#8B9BB4",
     "#5A6988",
     "#C28569",
     "#C0CBDC"
    ],
    "dark": [
     "#3a414c",
     "#262c39",
     "#51382c",
     "#51555c"
    ]
   },
   "roof": {
    "flat": {
     "light": "#BE4A2F",
     "dark": "#501f14"
    },
    "variants": {
     "light": [
      "#BE4A2F",
      "#A22633",
      "#733E39",
      "#124E89"
     ],
     "dark": [
      "#501f14",
      "#441015",
      "#301a18",
      "#08213a"
     ]
    },
    "pitched": {
     "probability": 0.9,
     "maxHeightM": 24,
     "areaM2": [
      30,
      1400
     ],
     "riseMaxM": 5,
     "riseHeightRatio": 0.35,
     "colors": {
      "light": [
       "#BE4A2F",
       "#A22633",
       "#124E89"
      ],
      "dark": [
       "#501f14",
       "#441015",
       "#08213a"
      ]
     },
     "weights": [
      0.5,
      0.3,
      0.2
     ]
    }
   },
   "groundFloor": {
    "colors": {
     "light": "#8B9BB4",
     "dark": "#3a414c"
    }
   }
  },
  "civic": {
   "wall": {
    "light": [
     "#EAD4AA",
     "#E8B796",
     "#FFFFFF",
     "#C0CBDC"
    ],
    "dark": [
     "#625947",
     "#614d3f",
     "#6b6b6b",
     "#51555c"
    ]
   },
   "roof": {
    "flat": {
     "light": "#A22633",
     "dark": "#441015"
    },
    "variants": {
     "light": [
      "#BE4A2F",
      "#A22633",
      "#733E39",
      "#124E89"
     ],
     "dark": [
      "#501f14",
      "#441015",
      "#301a18",
      "#08213a"
     ]
    },
    "pitched": {
     "probability": 0.9,
     "maxHeightM": 24,
     "areaM2": [
      30,
      1400
     ],
     "riseMaxM": 5,
     "riseHeightRatio": 0.35,
     "colors": {
      "light": [
       "#BE4A2F",
       "#A22633",
       "#124E89"
      ],
      "dark": [
       "#501f14",
       "#441015",
       "#08213a"
      ]
     },
     "weights": [
      0.5,
      0.3,
      0.2
     ]
    }
   },
   "groundFloor": {
    "colors": {
     "light": "#EAD4AA",
     "dark": "#625947"
    }
   }
  }
 },
 "materialFamilies": {
  "navyGlass": {
   "wall": {
    "light": [
     "#C0CBDC",
     "#8B9BB4",
     "#EAD4AA"
    ],
    "dark": [
     "#51555c",
     "#3a414c",
     "#625947"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "silverGlass": {
   "wall": {
    "light": [
     "#C0CBDC",
     "#8B9BB4",
     "#EAD4AA"
    ],
    "dark": [
     "#51555c",
     "#3a414c",
     "#625947"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "blueGlass": {
   "wall": {
    "light": [
     "#C0CBDC",
     "#8B9BB4",
     "#EAD4AA"
    ],
    "dark": [
     "#51555c",
     "#3a414c",
     "#625947"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "ivoryStone": {
   "wall": {
    "light": [
     "#EAD4AA",
     "#FFFFFF",
     "#E4A672"
    ],
    "dark": [
     "#625947",
     "#6b6b6b",
     "#604630"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "warmStone": {
   "wall": {
    "light": [
     "#EAD4AA",
     "#FFFFFF",
     "#E4A672"
    ],
    "dark": [
     "#625947",
     "#6b6b6b",
     "#604630"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "redBrick": {
   "wall": {
    "light": [
     "#C28569",
     "#B86F50",
     "#E8B796"
    ],
    "dark": [
     "#51382c",
     "#4d2f22",
     "#614d3f"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "paintedConcrete": {
   "wall": {
    "light": [
     "#EAD4AA",
     "#FFFFFF",
     "#E4A672"
    ],
    "dark": [
     "#625947",
     "#6b6b6b",
     "#604630"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "plaster": {
   "wall": {
    "light": [
     "#EAD4AA",
     "#FFFFFF",
     "#E4A672"
    ],
    "dark": [
     "#625947",
     "#6b6b6b",
     "#604630"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  },
  "galvanizedMetal": {
   "wall": {
    "light": [
     "#8B9BB4",
     "#5A6988",
     "#C28569"
    ],
    "dark": [
     "#3a414c",
     "#262c39",
     "#51382c"
    ]
   },
   "glass": {
    "light": [
     "#124E89",
     "#0099DB",
     "#3A4466"
    ],
    "dark": [
     "#08213a",
     "#00405c",
     "#181d2b"
    ]
   },
   "roof": {
    "light": [
     "#BE4A2F",
     "#A22633",
     "#733E39"
    ],
    "dark": [
     "#501f14",
     "#441015",
     "#301a18"
    ]
   }
  }
 },
 "props": {
  "trees": {
   "streetSpacingM": {
    "primary": 9,
    "secondary": 8,
    "tertiary": 8
   },
   "streetCrownDiameterM": [
    4.5,
    6.5
   ],
   "colors": {
    "light": [
     "#265C42",
     "#3E8948",
     "#63C74D"
    ],
    "dark": [
     "#10271c",
     "#1a3a1e",
     "#2a5420"
    ]
   },
   "weights": [
    0.4,
    0.4,
    0.2
   ],
   "trunk": {
    "light": "#733E39",
    "dark": "#301a18"
   },
   "parkAreaPerTreeM2": 60,
   "parkMinSpacingM": 5,
   "parkCrownDiameterM": [
    5,
    7.5
   ],
   "maxVisible": {
    "desktop": 1800,
    "phone": 600
   }
  },
  "vehicles": {
   "colors": [
    "#E43B44",
    "#0099DB",
    "#63C74D",
    "#F77622",
    "#B55088",
    "#FFFFFF",
    "#2CE8F5",
    "#BE4A2F"
   ],
   "weights": [
    0.15,
    0.15,
    0.13,
    0.13,
    0.11,
    0.13,
    0.1,
    0.1
   ],
   "per100M": {
    "primary": 5,
    "secondary": 4,
    "tertiary": 2.6,
    "minor": 1.2,
    "service": 0.4
   }
  }
 },
 "buildingDefaults": {
  "windowBandMinPx": 1.6,
  "windowCellMinPx": 2.6,
  "glass": {
   "light": "#124E89",
   "dark": "#08213a"
  },
  "waterproofRoof": {
   "colors": {
    "light": "#3E8948",
    "dark": "#1a3a1e"
   }
  },
  "equipment": {
   "colors": {
    "light": "#8B9BB4",
    "dark": "#3a414c"
   }
  }
 }
};
