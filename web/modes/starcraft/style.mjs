// 스타크래프트 종족별 도시 색·재질 덧쓰기. 건물 윤곽과 치수는 기본 도시 팩을 그대로 쓴다.
// 배열 길이와 재질 배분은 유지하고, 낮·밤 팔레트와 기존 바닥 질감만 바꾼다.

export const TERRAN_DELTA = {
  "id": "terran",
  "label": "테란 / 황무지 강철 기지",
  "ground": {
    "light": {
      "base": "#a69f90",
      "residential": "#a29a88",
      "commercial": "#a1a29b",
      "retail": "#b0a08a",
      "industrial": "#929a99",
      "civic": "#b9b2a0",
      "hospital": "#b5b9ac",
      "park": "#85836a",
      "grass": "#969477",
      "forest": "#666d58",
      "water": "#608699",
      "sidewalk": "#c4bdab",
      "ballast": "#797e7e"
    },
    "dark": {
      "base": "#302f2d",
      "residential": "#34312c",
      "commercial": "#303539",
      "retail": "#3c342b",
      "industrial": "#2d3336",
      "civic": "#403d34",
      "hospital": "#3c413b",
      "park": "#30362b",
      "grass": "#383c2e",
      "forest": "#252e25",
      "water": "#1b3543",
      "sidewalk": "#514d43",
      "ballast": "#3c4448"
    },
    "texture": {
      "size": 256,
      "pixelRatio": 2,
      "blotch": 0.025,
      "grain": 0.025,
      "crumbs": 650,
      "pebbles": 18
    }
  },
  "roads": {
    "classes": {
      "motorway": {
        "colors": {
          "light": "#626e77",
          "dark": "#262f39"
        }
      },
      "primary": {
        "colors": {
          "light": "#6b7780",
          "dark": "#2e3842"
        }
      },
      "secondary": {
        "colors": {
          "light": "#78818a",
          "dark": "#35404a"
        }
      },
      "tertiary": {
        "colors": {
          "light": "#848b8d",
          "dark": "#3d464d"
        }
      },
      "minor": {
        "colors": {
          "light": "#90948e",
          "dark": "#454d4e"
        }
      },
      "service": {
        "colors": {
          "light": "#9b9d93",
          "dark": "#4d5451"
        }
      }
    },
    "lane": {
      "colors": {
        "light": "#9aaab3",
        "dark": "#566774"
      },
      "opacity": {
        "light": 0.45,
        "dark": 0.3
      }
    },
    "centerLine": {
      "colors": {
        "light": "#e6ab54",
        "dark": "#e6ab54"
      },
      "opacity": {
        "light": 0.65,
        "dark": 0.45
      }
    }
  },
  "buildings": {
    "house": {
      "wall": {
        "light": [
          "#70889c",
          "#9aaab3",
          "#4c6075",
          "#b8bfc0"
        ],
        "dark": [
          "#3c5063",
          "#566774",
          "#2d3e51",
          "#6b777d"
        ]
      },
      "roof": {
        "flat": {
          "light": "#8299aa",
          "dark": "#41596c"
        },
        "variants": {
          "light": [
            "#8299aa",
            "#536d85",
            "#b4bec5",
            "#b47c48"
          ],
          "dark": [
            "#41596c",
            "#304459",
            "#5c6e7a",
            "#705136"
          ]
        },
        "pitched": {
          "colors": {
            "light": [
              "#8299aa",
              "#536d85",
              "#b4bec5"
            ],
            "dark": [
              "#41596c",
              "#304459",
              "#5c6e7a"
            ]
          }
        }
      }
    },
    "apartment": {
      "wall": {
        "light": [
          "#9aaab3",
          "#4c6075",
          "#b8bfc0",
          "#70889c"
        ],
        "dark": [
          "#566774",
          "#2d3e51",
          "#6b777d",
          "#3c5063"
        ]
      },
      "roof": {
        "flat": {
          "light": "#536d85",
          "dark": "#304459"
        },
        "variants": {
          "light": [
            "#536d85",
            "#b4bec5",
            "#b47c48",
            "#8299aa"
          ],
          "dark": [
            "#304459",
            "#5c6e7a",
            "#705136",
            "#41596c"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#9aaab3",
          "dark": "#566774"
        }
      }
    },
    "shop": {
      "wall": {
        "light": [
          "#4c6075",
          "#b8bfc0",
          "#70889c",
          "#9aaab3"
        ],
        "dark": [
          "#2d3e51",
          "#6b777d",
          "#3c5063",
          "#566774"
        ]
      },
      "roof": {
        "flat": {
          "light": "#b4bec5",
          "dark": "#5c6e7a"
        },
        "variants": {
          "light": [
            "#b4bec5",
            "#b47c48",
            "#8299aa",
            "#536d85"
          ],
          "dark": [
            "#5c6e7a",
            "#705136",
            "#41596c",
            "#304459"
          ]
        }
      },
      "awning": {
        "colors": {
          "light": [
            "#e6ab54",
            "#70889c",
            "#536d85"
          ],
          "dark": [
            "#705136",
            "#3c5063",
            "#304459"
          ]
        }
      }
    },
    "office": {
      "wall": {
        "light": [
          "#b8bfc0",
          "#70889c",
          "#9aaab3",
          "#4c6075"
        ],
        "dark": [
          "#6b777d",
          "#3c5063",
          "#566774",
          "#2d3e51"
        ]
      },
      "roof": {
        "flat": {
          "light": "#b47c48",
          "dark": "#705136"
        },
        "variants": {
          "light": [
            "#b47c48",
            "#8299aa",
            "#536d85",
            "#b4bec5"
          ],
          "dark": [
            "#705136",
            "#41596c",
            "#304459",
            "#5c6e7a"
          ]
        }
      },
      "glass": {
        "light": "#84b8d1",
        "dark": "#31566b"
      }
    },
    "industrial": {
      "wall": {
        "light": [
          "#70889c",
          "#9aaab3",
          "#4c6075",
          "#b8bfc0"
        ],
        "dark": [
          "#3c5063",
          "#566774",
          "#2d3e51",
          "#6b777d"
        ]
      },
      "roof": {
        "flat": {
          "light": "#8299aa",
          "dark": "#41596c"
        },
        "variants": {
          "light": [
            "#8299aa",
            "#536d85",
            "#b4bec5",
            "#b47c48"
          ],
          "dark": [
            "#41596c",
            "#304459",
            "#5c6e7a",
            "#705136"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#70889c",
          "dark": "#3c5063"
        }
      }
    },
    "civic": {
      "wall": {
        "light": [
          "#9aaab3",
          "#4c6075",
          "#b8bfc0",
          "#70889c"
        ],
        "dark": [
          "#566774",
          "#2d3e51",
          "#6b777d",
          "#3c5063"
        ]
      },
      "roof": {
        "flat": {
          "light": "#536d85",
          "dark": "#304459"
        },
        "variants": {
          "light": [
            "#536d85",
            "#b4bec5",
            "#b47c48",
            "#8299aa"
          ],
          "dark": [
            "#304459",
            "#5c6e7a",
            "#705136",
            "#41596c"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#9aaab3",
          "dark": "#566774"
        }
      }
    }
  },
  "buildingDefaults": {
    "glass": {
      "light": "#84b8d1",
      "dark": "#31566b"
    },
    "litWindows": {
      "colors": [
        "#dfedfa",
        "#ffb66b",
        "#b6d9f0"
      ]
    },
    "equipment": {
      "colors": {
        "light": "#8299aa",
        "dark": "#41596c"
      }
    },
    "waterproofRoof": {
      "colors": {
        "light": "#536d85",
        "dark": "#304459"
      }
    }
  },
  "materialFamilies": {
    "navyGlass": {
      "wall": {
        "light": [
          "#4c6075",
          "#b8bfc0",
          "#70889c"
        ],
        "dark": [
          "#2d3e51",
          "#6b777d",
          "#3c5063"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#b4bec5",
          "#b47c48",
          "#8299aa"
        ],
        "dark": [
          "#5c6e7a",
          "#705136",
          "#41596c"
        ]
      }
    },
    "silverGlass": {
      "wall": {
        "light": [
          "#9aaab3",
          "#4c6075",
          "#b8bfc0"
        ],
        "dark": [
          "#566774",
          "#2d3e51",
          "#6b777d"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#536d85",
          "#b4bec5",
          "#b47c48"
        ],
        "dark": [
          "#304459",
          "#5c6e7a",
          "#705136"
        ]
      }
    },
    "blueGlass": {
      "wall": {
        "light": [
          "#70889c",
          "#9aaab3",
          "#4c6075"
        ],
        "dark": [
          "#3c5063",
          "#566774",
          "#2d3e51"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#8299aa",
          "#536d85",
          "#b4bec5"
        ],
        "dark": [
          "#41596c",
          "#304459",
          "#5c6e7a"
        ]
      }
    },
    "ivoryStone": {
      "wall": {
        "light": [
          "#9aaab3",
          "#4c6075",
          "#b8bfc0"
        ],
        "dark": [
          "#566774",
          "#2d3e51",
          "#6b777d"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#536d85",
          "#b4bec5",
          "#b47c48"
        ],
        "dark": [
          "#304459",
          "#5c6e7a",
          "#705136"
        ]
      }
    },
    "warmStone": {
      "wall": {
        "light": [
          "#b8bfc0",
          "#70889c",
          "#9aaab3"
        ],
        "dark": [
          "#6b777d",
          "#3c5063",
          "#566774"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#b47c48",
          "#8299aa",
          "#536d85"
        ],
        "dark": [
          "#705136",
          "#41596c",
          "#304459"
        ]
      }
    },
    "redBrick": {
      "wall": {
        "light": [
          "#4c6075",
          "#b8bfc0",
          "#70889c"
        ],
        "dark": [
          "#2d3e51",
          "#6b777d",
          "#3c5063"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#b4bec5",
          "#b47c48",
          "#8299aa"
        ],
        "dark": [
          "#5c6e7a",
          "#705136",
          "#41596c"
        ]
      }
    },
    "paintedConcrete": {
      "wall": {
        "light": [
          "#70889c",
          "#9aaab3",
          "#4c6075"
        ],
        "dark": [
          "#3c5063",
          "#566774",
          "#2d3e51"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#8299aa",
          "#536d85",
          "#b4bec5"
        ],
        "dark": [
          "#41596c",
          "#304459",
          "#5c6e7a"
        ]
      }
    },
    "plaster": {
      "wall": {
        "light": [
          "#9aaab3",
          "#4c6075",
          "#b8bfc0"
        ],
        "dark": [
          "#566774",
          "#2d3e51",
          "#6b777d"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#536d85",
          "#b4bec5",
          "#b47c48"
        ],
        "dark": [
          "#304459",
          "#5c6e7a",
          "#705136"
        ]
      }
    },
    "galvanizedMetal": {
      "wall": {
        "light": [
          "#70889c",
          "#9aaab3",
          "#4c6075"
        ],
        "dark": [
          "#3c5063",
          "#566774",
          "#2d3e51"
        ]
      },
      "glass": {
        "light": [
          "#84b8d1",
          "#537f9e",
          "#bad6df"
        ],
        "dark": [
          "#31566b",
          "#244154",
          "#456d7c"
        ]
      },
      "roof": {
        "light": [
          "#8299aa",
          "#536d85",
          "#b4bec5"
        ],
        "dark": [
          "#41596c",
          "#304459",
          "#5c6e7a"
        ]
      }
    }
  },
  "viaduct": {
    "colors": {
      "light": {
        "concrete": "#adb9c0",
        "under": "#647483",
        "pier": "#8a9ba8",
        "bed": "#3e4b57",
        "rail": "#9daeb9",
        "platform": "#d1c9ad",
        "roof": "#4e6b85",
        "roofUnder": "#8d9eac",
        "post": "#b2bfc5",
        "stair": "#c5c8bb",
        "stairWall": "#8698a4",
        "walk": "#c4c5b7",
        "walkWall": "#81929e"
      },
      "dark": {
        "concrete": "#758794",
        "under": "#465767",
        "pier": "#637784",
        "bed": "#303e4b",
        "rail": "#8c9eaa",
        "platform": "#9ca38e",
        "roof": "#394f66",
        "roofUnder": "#627784",
        "post": "#8195a1",
        "stair": "#909c92",
        "stairWall": "#647a86",
        "walk": "#8e998f",
        "walkWall": "#5e7480"
      }
    },
    "night": {
      "glow": "#dfedfa"
    }
  },
  "props": {
    "lamps": {
      "pole": {
        "light": "#536d85",
        "dark": "#304459"
      },
      "light": "#dfedfa"
    }
  },
  "lighting": {
    "shadow": {
      "color": "#37434d"
    }
  },
  "night": {
    "lights": {
      "street": {
        "color": "#dfedfa"
      },
      "moon": {
        "color": "#b5cde8"
      }
    },
    "ground": {
      "downtown": {
        "colors": [
          "#dfedfa",
          "#ffb66b",
          "#b6d9f0"
        ],
        "opacity": 0.28
      }
    },
    "bloom": {
      "tint": "#e0edfa"
    }
  }
};

export const ZERG_DELTA = {
  "id": "zerg",
  "label": "저그 / 보랏빛 크립 군락",
  "ground": {
    "light": {
      "base": "#402c49",
      "residential": "#48304f",
      "commercial": "#3c2b47",
      "retail": "#4d314e",
      "industrial": "#392b3f",
      "civic": "#54384e",
      "hospital": "#4b3b4a",
      "park": "#45374e",
      "grass": "#514156",
      "forest": "#322d3e",
      "water": "#394f60",
      "sidewalk": "#725964",
      "ballast": "#8e8073"
    },
    "dark": {
      "base": "#251d2e",
      "residential": "#2d2134",
      "commercial": "#241d2d",
      "retail": "#322235",
      "industrial": "#241e2b",
      "civic": "#362639",
      "hospital": "#302735",
      "park": "#2b2733",
      "grass": "#342c3b",
      "forest": "#211f2b",
      "water": "#1a303f",
      "sidewalk": "#51404c",
      "ballast": "#6c6259"
    },
    "texture": {
      "size": 256,
      "pixelRatio": 2,
      "blotch": 0.14,
      "grain": 0.025,
      "crumbs": 950,
      "pebbles": 8
    }
  },
  "roads": {
    "classes": {
      "motorway": {
        "colors": {
          "light": "#5c4943",
          "dark": "#332a29"
        }
      },
      "primary": {
        "colors": {
          "light": "#665149",
          "dark": "#3b2f2c"
        }
      },
      "secondary": {
        "colors": {
          "light": "#715a50",
          "dark": "#443630"
        }
      },
      "tertiary": {
        "colors": {
          "light": "#796258",
          "dark": "#4c3d36"
        }
      },
      "minor": {
        "colors": {
          "light": "#826c5e",
          "dark": "#54453b"
        }
      },
      "service": {
        "colors": {
          "light": "#8b7566",
          "dark": "#5d4d41"
        }
      }
    },
    "lane": {
      "colors": {
        "light": "#b7818b",
        "dark": "#805462"
      },
      "opacity": {
        "light": 0.08,
        "dark": 0.04
      }
    },
    "centerLine": {
      "colors": {
        "light": "#a9c788",
        "dark": "#a9c788"
      },
      "opacity": {
        "light": 0.12,
        "dark": 0.08
      }
    }
  },
  "buildings": {
    "house": {
      "wall": {
        "light": [
          "#966176",
          "#b7818b",
          "#78556c",
          "#c39b8c"
        ],
        "dark": [
          "#684454",
          "#805462",
          "#513b50",
          "#927064"
        ]
      },
      "roof": {
        "flat": {
          "light": "#765064",
          "dark": "#4c3548"
        },
        "variants": {
          "light": [
            "#765064",
            "#9b6478",
            "#b18481",
            "#60465e"
          ],
          "dark": [
            "#4c3548",
            "#674352",
            "#805d5c",
            "#3e303f"
          ]
        },
        "pitched": {
          "colors": {
            "light": [
              "#765064",
              "#9b6478",
              "#b18481"
            ],
            "dark": [
              "#4c3548",
              "#674352",
              "#805d5c"
            ]
          }
        }
      }
    },
    "apartment": {
      "wall": {
        "light": [
          "#b7818b",
          "#78556c",
          "#c39b8c",
          "#966176"
        ],
        "dark": [
          "#805462",
          "#513b50",
          "#927064",
          "#684454"
        ]
      },
      "roof": {
        "flat": {
          "light": "#9b6478",
          "dark": "#674352"
        },
        "variants": {
          "light": [
            "#9b6478",
            "#b18481",
            "#60465e",
            "#765064"
          ],
          "dark": [
            "#674352",
            "#805d5c",
            "#3e303f",
            "#4c3548"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#b7818b",
          "dark": "#805462"
        }
      }
    },
    "shop": {
      "wall": {
        "light": [
          "#78556c",
          "#c39b8c",
          "#966176",
          "#b7818b"
        ],
        "dark": [
          "#513b50",
          "#927064",
          "#684454",
          "#805462"
        ]
      },
      "roof": {
        "flat": {
          "light": "#b18481",
          "dark": "#805d5c"
        },
        "variants": {
          "light": [
            "#b18481",
            "#60465e",
            "#765064",
            "#9b6478"
          ],
          "dark": [
            "#805d5c",
            "#3e303f",
            "#4c3548",
            "#674352"
          ]
        }
      },
      "awning": {
        "colors": {
          "light": [
            "#a9c788",
            "#966176",
            "#9b6478"
          ],
          "dark": [
            "#3e303f",
            "#684454",
            "#674352"
          ]
        }
      }
    },
    "office": {
      "wall": {
        "light": [
          "#c39b8c",
          "#966176",
          "#b7818b",
          "#78556c"
        ],
        "dark": [
          "#927064",
          "#684454",
          "#805462",
          "#513b50"
        ]
      },
      "roof": {
        "flat": {
          "light": "#60465e",
          "dark": "#3e303f"
        },
        "variants": {
          "light": [
            "#60465e",
            "#765064",
            "#9b6478",
            "#b18481"
          ],
          "dark": [
            "#3e303f",
            "#4c3548",
            "#674352",
            "#805d5c"
          ]
        }
      },
      "glass": {
        "light": "#9aaf69",
        "dark": "#526c3e"
      }
    },
    "industrial": {
      "wall": {
        "light": [
          "#966176",
          "#b7818b",
          "#78556c",
          "#c39b8c"
        ],
        "dark": [
          "#684454",
          "#805462",
          "#513b50",
          "#927064"
        ]
      },
      "roof": {
        "flat": {
          "light": "#765064",
          "dark": "#4c3548"
        },
        "variants": {
          "light": [
            "#765064",
            "#9b6478",
            "#b18481",
            "#60465e"
          ],
          "dark": [
            "#4c3548",
            "#674352",
            "#805d5c",
            "#3e303f"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#966176",
          "dark": "#684454"
        }
      }
    },
    "civic": {
      "wall": {
        "light": [
          "#b7818b",
          "#78556c",
          "#c39b8c",
          "#966176"
        ],
        "dark": [
          "#805462",
          "#513b50",
          "#927064",
          "#684454"
        ]
      },
      "roof": {
        "flat": {
          "light": "#9b6478",
          "dark": "#674352"
        },
        "variants": {
          "light": [
            "#9b6478",
            "#b18481",
            "#60465e",
            "#765064"
          ],
          "dark": [
            "#674352",
            "#805d5c",
            "#3e303f",
            "#4c3548"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#b7818b",
          "dark": "#805462"
        }
      }
    }
  },
  "buildingDefaults": {
    "glass": {
      "light": "#9aaf69",
      "dark": "#526c3e"
    },
    "litWindows": {
      "colors": [
        "#eb83b4",
        "#b6e48c",
        "#dba1cd"
      ]
    },
    "equipment": {
      "colors": {
        "light": "#765064",
        "dark": "#4c3548"
      }
    },
    "waterproofRoof": {
      "colors": {
        "light": "#9b6478",
        "dark": "#674352"
      }
    }
  },
  "materialFamilies": {
    "navyGlass": {
      "wall": {
        "light": [
          "#78556c",
          "#c39b8c",
          "#966176"
        ],
        "dark": [
          "#513b50",
          "#927064",
          "#684454"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#b18481",
          "#60465e",
          "#765064"
        ],
        "dark": [
          "#805d5c",
          "#3e303f",
          "#4c3548"
        ]
      }
    },
    "silverGlass": {
      "wall": {
        "light": [
          "#b7818b",
          "#78556c",
          "#c39b8c"
        ],
        "dark": [
          "#805462",
          "#513b50",
          "#927064"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#9b6478",
          "#b18481",
          "#60465e"
        ],
        "dark": [
          "#674352",
          "#805d5c",
          "#3e303f"
        ]
      }
    },
    "blueGlass": {
      "wall": {
        "light": [
          "#966176",
          "#b7818b",
          "#78556c"
        ],
        "dark": [
          "#684454",
          "#805462",
          "#513b50"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#765064",
          "#9b6478",
          "#b18481"
        ],
        "dark": [
          "#4c3548",
          "#674352",
          "#805d5c"
        ]
      }
    },
    "ivoryStone": {
      "wall": {
        "light": [
          "#b7818b",
          "#78556c",
          "#c39b8c"
        ],
        "dark": [
          "#805462",
          "#513b50",
          "#927064"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#9b6478",
          "#b18481",
          "#60465e"
        ],
        "dark": [
          "#674352",
          "#805d5c",
          "#3e303f"
        ]
      }
    },
    "warmStone": {
      "wall": {
        "light": [
          "#c39b8c",
          "#966176",
          "#b7818b"
        ],
        "dark": [
          "#927064",
          "#684454",
          "#805462"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#60465e",
          "#765064",
          "#9b6478"
        ],
        "dark": [
          "#3e303f",
          "#4c3548",
          "#674352"
        ]
      }
    },
    "redBrick": {
      "wall": {
        "light": [
          "#78556c",
          "#c39b8c",
          "#966176"
        ],
        "dark": [
          "#513b50",
          "#927064",
          "#684454"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#b18481",
          "#60465e",
          "#765064"
        ],
        "dark": [
          "#805d5c",
          "#3e303f",
          "#4c3548"
        ]
      }
    },
    "paintedConcrete": {
      "wall": {
        "light": [
          "#966176",
          "#b7818b",
          "#78556c"
        ],
        "dark": [
          "#684454",
          "#805462",
          "#513b50"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#765064",
          "#9b6478",
          "#b18481"
        ],
        "dark": [
          "#4c3548",
          "#674352",
          "#805d5c"
        ]
      }
    },
    "plaster": {
      "wall": {
        "light": [
          "#b7818b",
          "#78556c",
          "#c39b8c"
        ],
        "dark": [
          "#805462",
          "#513b50",
          "#927064"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#9b6478",
          "#b18481",
          "#60465e"
        ],
        "dark": [
          "#674352",
          "#805d5c",
          "#3e303f"
        ]
      }
    },
    "galvanizedMetal": {
      "wall": {
        "light": [
          "#966176",
          "#b7818b",
          "#78556c"
        ],
        "dark": [
          "#684454",
          "#805462",
          "#513b50"
        ]
      },
      "glass": {
        "light": [
          "#9aaf69",
          "#b680aa",
          "#789761"
        ],
        "dark": [
          "#526c3e",
          "#75466a",
          "#3e5836"
        ]
      },
      "roof": {
        "light": [
          "#765064",
          "#9b6478",
          "#b18481"
        ],
        "dark": [
          "#4c3548",
          "#674352",
          "#805d5c"
        ]
      }
    }
  },
  "viaduct": {
    "colors": {
      "light": {
        "concrete": "#c6baa1",
        "under": "#877a70",
        "pier": "#ad9f8b",
        "bed": "#4c443f",
        "rail": "#b8aa95",
        "platform": "#ddd0b0",
        "roof": "#a68d79",
        "roofUnder": "#c3b397",
        "post": "#c6b899",
        "stair": "#d3c6a8",
        "stairWall": "#ad9e87",
        "walk": "#d1c3a5",
        "walkWall": "#ab9b84"
      },
      "dark": {
        "concrete": "#9c9382",
        "under": "#655c56",
        "pier": "#8b8071",
        "bed": "#3d3635",
        "rail": "#a29683",
        "platform": "#b6ad94",
        "roof": "#817160",
        "roofUnder": "#9b8d79",
        "post": "#ac9f86",
        "stair": "#b2a78e",
        "stairWall": "#8c8270",
        "walk": "#afa38c",
        "walkWall": "#887e6c"
      }
    },
    "night": {
      "glow": "#a6df83"
    }
  },
  "props": {
    "lamps": {
      "pole": {
        "light": "#9b6478",
        "dark": "#674352"
      },
      "light": "#a6df83"
    }
  },
  "lighting": {
    "shadow": {
      "color": "#2b2236"
    }
  },
  "night": {
    "lights": {
      "street": {
        "color": "#a6df83"
      },
      "moon": {
        "color": "#d0b9d5"
      }
    },
    "ground": {
      "downtown": {
        "colors": [
          "#eb83b4",
          "#b6e48c",
          "#dba1cd"
        ],
        "opacity": 0.22
      }
    },
    "bloom": {
      "tint": "#e7bddb"
    }
  }
};

export const PROTOSS_DELTA = {
  "id": "protoss",
  "label": "프로토스 / 상아와 수정의 도시",
  "ground": {
    "light": {
      "base": "#d8ceae",
      "residential": "#dfd5b8",
      "commercial": "#d0d6c9",
      "retail": "#e7d8b6",
      "industrial": "#c7c6b2",
      "civic": "#eee5cc",
      "hospital": "#e1e5d7",
      "park": "#a8b99a",
      "grass": "#bdc8a8",
      "forest": "#7b967e",
      "water": "#6faebc",
      "sidewalk": "#f0e9d5",
      "ballast": "#aaa99a"
    },
    "dark": {
      "base": "#383a36",
      "residential": "#414138",
      "commercial": "#303d3e",
      "retail": "#484335",
      "industrial": "#303936",
      "civic": "#514e3e",
      "hospital": "#424c44",
      "park": "#2c3d35",
      "grass": "#35473c",
      "forest": "#22372f",
      "water": "#1c3c4c",
      "sidewalk": "#646250",
      "ballast": "#4a514b"
    },
    "texture": {
      "size": 256,
      "pixelRatio": 2,
      "blotch": 0.018,
      "grain": 0.012,
      "crumbs": 280,
      "pebbles": 0
    }
  },
  "roads": {
    "classes": {
      "motorway": {
        "colors": {
          "light": "#b3b9ad",
          "dark": "#3e504f"
        }
      },
      "primary": {
        "colors": {
          "light": "#bcc3b5",
          "dark": "#465a57"
        }
      },
      "secondary": {
        "colors": {
          "light": "#c6ccbc",
          "dark": "#50635d"
        }
      },
      "tertiary": {
        "colors": {
          "light": "#d0d3c1",
          "dark": "#5a6b62"
        }
      },
      "minor": {
        "colors": {
          "light": "#d9dccb",
          "dark": "#64746b"
        }
      },
      "service": {
        "colors": {
          "light": "#e1e2d1",
          "dark": "#6d7d72"
        }
      }
    },
    "lane": {
      "colors": {
        "light": "#f0e5c8",
        "dark": "#a49a7d"
      },
      "opacity": {
        "light": 0.45,
        "dark": 0.3
      }
    },
    "centerLine": {
      "colors": {
        "light": "#c6aa68",
        "dark": "#c6aa68"
      },
      "opacity": {
        "light": 0.12,
        "dark": 0.08
      }
    }
  },
  "buildings": {
    "house": {
      "wall": {
        "light": [
          "#dbc58c",
          "#f0e5c8",
          "#b89b60",
          "#e9d39d"
        ],
        "dark": [
          "#85734c",
          "#a49a7d",
          "#6a583a",
          "#998257"
        ]
      },
      "roof": {
        "flat": {
          "light": "#c1a25c",
          "dark": "#78623c"
        },
        "variants": {
          "light": [
            "#c1a25c",
            "#e2ca8b",
            "#a58648",
            "#eee4c5"
          ],
          "dark": [
            "#78623c",
            "#958052",
            "#625030",
            "#a39a7c"
          ]
        },
        "pitched": {
          "colors": {
            "light": [
              "#c1a25c",
              "#e2ca8b",
              "#a58648"
            ],
            "dark": [
              "#78623c",
              "#958052",
              "#625030"
            ]
          }
        }
      }
    },
    "apartment": {
      "wall": {
        "light": [
          "#f0e5c8",
          "#b89b60",
          "#e9d39d",
          "#dbc58c"
        ],
        "dark": [
          "#a49a7d",
          "#6a583a",
          "#998257",
          "#85734c"
        ]
      },
      "roof": {
        "flat": {
          "light": "#e2ca8b",
          "dark": "#958052"
        },
        "variants": {
          "light": [
            "#e2ca8b",
            "#a58648",
            "#eee4c5",
            "#c1a25c"
          ],
          "dark": [
            "#958052",
            "#625030",
            "#a39a7c",
            "#78623c"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#f0e5c8",
          "dark": "#a49a7d"
        }
      }
    },
    "shop": {
      "wall": {
        "light": [
          "#b89b60",
          "#e9d39d",
          "#dbc58c",
          "#f0e5c8"
        ],
        "dark": [
          "#6a583a",
          "#998257",
          "#85734c",
          "#a49a7d"
        ]
      },
      "roof": {
        "flat": {
          "light": "#a58648",
          "dark": "#625030"
        },
        "variants": {
          "light": [
            "#a58648",
            "#eee4c5",
            "#c1a25c",
            "#e2ca8b"
          ],
          "dark": [
            "#625030",
            "#a39a7c",
            "#78623c",
            "#958052"
          ]
        }
      },
      "awning": {
        "colors": {
          "light": [
            "#c6aa68",
            "#dbc58c",
            "#e2ca8b"
          ],
          "dark": [
            "#a39a7c",
            "#85734c",
            "#958052"
          ]
        }
      }
    },
    "office": {
      "wall": {
        "light": [
          "#e9d39d",
          "#dbc58c",
          "#f0e5c8",
          "#b89b60"
        ],
        "dark": [
          "#998257",
          "#85734c",
          "#a49a7d",
          "#6a583a"
        ]
      },
      "roof": {
        "flat": {
          "light": "#eee4c5",
          "dark": "#a39a7c"
        },
        "variants": {
          "light": [
            "#eee4c5",
            "#c1a25c",
            "#e2ca8b",
            "#a58648"
          ],
          "dark": [
            "#a39a7c",
            "#78623c",
            "#958052",
            "#625030"
          ]
        }
      },
      "glass": {
        "light": "#61c9ce",
        "dark": "#246d7b"
      }
    },
    "industrial": {
      "wall": {
        "light": [
          "#dbc58c",
          "#f0e5c8",
          "#b89b60",
          "#e9d39d"
        ],
        "dark": [
          "#85734c",
          "#a49a7d",
          "#6a583a",
          "#998257"
        ]
      },
      "roof": {
        "flat": {
          "light": "#c1a25c",
          "dark": "#78623c"
        },
        "variants": {
          "light": [
            "#c1a25c",
            "#e2ca8b",
            "#a58648",
            "#eee4c5"
          ],
          "dark": [
            "#78623c",
            "#958052",
            "#625030",
            "#a39a7c"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#dbc58c",
          "dark": "#85734c"
        }
      }
    },
    "civic": {
      "wall": {
        "light": [
          "#f0e5c8",
          "#b89b60",
          "#e9d39d",
          "#dbc58c"
        ],
        "dark": [
          "#a49a7d",
          "#6a583a",
          "#998257",
          "#85734c"
        ]
      },
      "roof": {
        "flat": {
          "light": "#e2ca8b",
          "dark": "#958052"
        },
        "variants": {
          "light": [
            "#e2ca8b",
            "#a58648",
            "#eee4c5",
            "#c1a25c"
          ],
          "dark": [
            "#958052",
            "#625030",
            "#a39a7c",
            "#78623c"
          ]
        }
      },
      "groundFloor": {
        "colors": {
          "light": "#f0e5c8",
          "dark": "#a49a7d"
        }
      }
    }
  },
  "buildingDefaults": {
    "glass": {
      "light": "#61c9ce",
      "dark": "#246d7b"
    },
    "litWindows": {
      "colors": [
        "#78e4ed",
        "#a5cef7",
        "#c5fff3"
      ]
    },
    "equipment": {
      "colors": {
        "light": "#c1a25c",
        "dark": "#78623c"
      }
    },
    "waterproofRoof": {
      "colors": {
        "light": "#e2ca8b",
        "dark": "#958052"
      }
    }
  },
  "materialFamilies": {
    "navyGlass": {
      "wall": {
        "light": [
          "#b89b60",
          "#e9d39d",
          "#dbc58c"
        ],
        "dark": [
          "#6a583a",
          "#998257",
          "#85734c"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#a58648",
          "#eee4c5",
          "#c1a25c"
        ],
        "dark": [
          "#625030",
          "#a39a7c",
          "#78623c"
        ]
      }
    },
    "silverGlass": {
      "wall": {
        "light": [
          "#f0e5c8",
          "#b89b60",
          "#e9d39d"
        ],
        "dark": [
          "#a49a7d",
          "#6a583a",
          "#998257"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#e2ca8b",
          "#a58648",
          "#eee4c5"
        ],
        "dark": [
          "#958052",
          "#625030",
          "#a39a7c"
        ]
      }
    },
    "blueGlass": {
      "wall": {
        "light": [
          "#dbc58c",
          "#f0e5c8",
          "#b89b60"
        ],
        "dark": [
          "#85734c",
          "#a49a7d",
          "#6a583a"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#c1a25c",
          "#e2ca8b",
          "#a58648"
        ],
        "dark": [
          "#78623c",
          "#958052",
          "#625030"
        ]
      }
    },
    "ivoryStone": {
      "wall": {
        "light": [
          "#f0e5c8",
          "#b89b60",
          "#e9d39d"
        ],
        "dark": [
          "#a49a7d",
          "#6a583a",
          "#998257"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#e2ca8b",
          "#a58648",
          "#eee4c5"
        ],
        "dark": [
          "#958052",
          "#625030",
          "#a39a7c"
        ]
      }
    },
    "warmStone": {
      "wall": {
        "light": [
          "#e9d39d",
          "#dbc58c",
          "#f0e5c8"
        ],
        "dark": [
          "#998257",
          "#85734c",
          "#a49a7d"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#eee4c5",
          "#c1a25c",
          "#e2ca8b"
        ],
        "dark": [
          "#a39a7c",
          "#78623c",
          "#958052"
        ]
      }
    },
    "redBrick": {
      "wall": {
        "light": [
          "#b89b60",
          "#e9d39d",
          "#dbc58c"
        ],
        "dark": [
          "#6a583a",
          "#998257",
          "#85734c"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#a58648",
          "#eee4c5",
          "#c1a25c"
        ],
        "dark": [
          "#625030",
          "#a39a7c",
          "#78623c"
        ]
      }
    },
    "paintedConcrete": {
      "wall": {
        "light": [
          "#dbc58c",
          "#f0e5c8",
          "#b89b60"
        ],
        "dark": [
          "#85734c",
          "#a49a7d",
          "#6a583a"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#c1a25c",
          "#e2ca8b",
          "#a58648"
        ],
        "dark": [
          "#78623c",
          "#958052",
          "#625030"
        ]
      }
    },
    "plaster": {
      "wall": {
        "light": [
          "#f0e5c8",
          "#b89b60",
          "#e9d39d"
        ],
        "dark": [
          "#a49a7d",
          "#6a583a",
          "#998257"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#e2ca8b",
          "#a58648",
          "#eee4c5"
        ],
        "dark": [
          "#958052",
          "#625030",
          "#a39a7c"
        ]
      }
    },
    "galvanizedMetal": {
      "wall": {
        "light": [
          "#dbc58c",
          "#f0e5c8",
          "#b89b60"
        ],
        "dark": [
          "#85734c",
          "#a49a7d",
          "#6a583a"
        ]
      },
      "glass": {
        "light": [
          "#61c9ce",
          "#3d9eae",
          "#a0e6df"
        ],
        "dark": [
          "#246d7b",
          "#1e5269",
          "#438f96"
        ]
      },
      "roof": {
        "light": [
          "#c1a25c",
          "#e2ca8b",
          "#a58648"
        ],
        "dark": [
          "#78623c",
          "#958052",
          "#625030"
        ]
      }
    }
  },
  "viaduct": {
    "colors": {
      "light": {
        "concrete": "#e0d6b4",
        "under": "#a99b77",
        "pier": "#ccba8d",
        "bed": "#657e7c",
        "rail": "#8bb8b9",
        "platform": "#f1e6c8",
        "roof": "#c6a65d",
        "roofUnder": "#bfae82",
        "post": "#d8c48d",
        "stair": "#e9dec0",
        "stairWall": "#c5b68d",
        "walk": "#e7ddbd",
        "walkWall": "#c2b28a"
      },
      "dark": {
        "concrete": "#a69e80",
        "under": "#71684f",
        "pier": "#96865f",
        "bed": "#385b60",
        "rail": "#66969a",
        "platform": "#bfb599",
        "roof": "#8b7343",
        "roofUnder": "#897b58",
        "post": "#aa985f",
        "stair": "#b6ac8d",
        "stairWall": "#918363",
        "walk": "#b1a88a",
        "walkWall": "#8d8060"
      }
    },
    "night": {
      "glow": "#81e6ed"
    }
  },
  "props": {
    "lamps": {
      "pole": {
        "light": "#e2ca8b",
        "dark": "#958052"
      },
      "light": "#81e6ed"
    }
  },
  "lighting": {
    "shadow": {
      "color": "#4d6059"
    }
  },
  "night": {
    "lights": {
      "street": {
        "color": "#81e6ed"
      },
      "moon": {
        "color": "#a6dce8"
      }
    },
    "ground": {
      "downtown": {
        "colors": [
          "#78e4ed",
          "#a5cef7",
          "#c5fff3"
        ],
        "opacity": 0.28
      }
    },
    "bloom": {
      "tint": "#b6f2f4"
    }
  }
};
