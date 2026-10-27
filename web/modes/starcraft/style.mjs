// web/modes/starcraft/style.mjs
var SEOUL_KEEP = [
	[
		126.94025,
		37.51985,
		20
	],
	[
		126.91405,
		37.53257,
		40
	],
	[
		126.97842,
		37.56679,
		40
	],
	[
		127.05911,
		37.51187,
		120
	],
	[
		127.0099,
		37.56707,
		90
	],
	[
		126.97536,
		37.55999,
		20
	],
	[
		127.00961,
		37.57111,
		20
	],
	[
		126.97682,
		37.57593,
		25
	],
	[
		126.97699,
		37.57854,
		150
	],
	[
		126.97424,
		37.56634,
		60
	],
	[
		126.98716,
		37.56316,
		50
	],
	[
		126.97155,
		37.55599,
		30
	],
	[
		126.89725,
		37.5683,
		140
	],
	[
		126.86707,
		37.49819,
		100
	],
	[
		126.92818,
		37.52614,
		110
	],
	[
		126.92603,
		37.52525,
		90
	],
	[
		126.97607,
		37.58668,
		120
	],
	[
		126.9756,
		37.57261,
		60
	],
	[
		127.10425,
		37.51374,
		100
	],
	[
		127.0728,
		37.5157,
		130
	],
	[
		126.96862,
		37.57064,
		60
	]
];
var TERRAN_DELTA = {
	"id": "terran",
	"label": "테란 / 황무지 강철 기지",
	"ground": {
		"light": {
			"base": "#444f5b",
			"residential": "#4b5661",
			"commercial": "#3e4b58",
			"retail": "#535b62",
			"industrial": "#394650",
			"civic": "#59626a",
			"hospital": "#56646b",
			"park": "#596047",
			"grass": "#666b4d",
			"forest": "#414d37",
			"water": "#344e5c",
			"sidewalk": "#7d898e",
			"ballast": "#353f48"
		},
		"dark": {
			"base": "#222b35",
			"residential": "#29323c",
			"commercial": "#202b36",
			"retail": "#30383e",
			"industrial": "#1e2932",
			"civic": "#333c44",
			"hospital": "#303f46",
			"park": "#30382a",
			"grass": "#3a412f",
			"forest": "#242f23",
			"water": "#172f3d",
			"sidewalk": "#4c5962",
			"ballast": "#26323d"
		},
		"texture": {
			"size": 256,
			"pixelRatio": 2,
			"blotch": .018,
			"grain": .025,
			"crumbs": 160,
			"pebbles": 0
		}
	},
	"roads": {
		"classes": {
			"motorway": { "colors": {
				"light": "#829098",
				"dark": "#465561"
			} },
			"primary": { "colors": {
				"light": "#89969d",
				"dark": "#4c5d68"
			} },
			"secondary": { "colors": {
				"light": "#919da2",
				"dark": "#53646e"
			} },
			"tertiary": { "colors": {
				"light": "#9aa5a8",
				"dark": "#5c6d75"
			} },
			"minor": { "colors": {
				"light": "#a1abad",
				"dark": "#65757c"
			} },
			"service": { "colors": {
				"light": "#aab2b1",
				"dark": "#6c7c80"
			} }
		},
		"lane": {
			"colors": {
				"light": "#c0c9c9",
				"dark": "#87989f"
			},
			"opacity": {
				"light": .45,
				"dark": .29250000000000004
			}
		},
		"centerLine": {
			"colors": {
				"light": "#c9aa67",
				"dark": "#8c7a52"
			},
			"opacity": {
				"light": .5,
				"dark": .32
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
				"pitched": { "colors": {
					"light": [
						"#617f9b",
						"#a7b5c0",
						"#be8c46"
					],
					"dark": [
						"#3e566d",
						"#768997",
						"#896635"
					]
				} }
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
			"groundFloor": { "colors": {
				"light": "#9aaab3",
				"dark": "#566774"
			} }
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
			"awning": { "colors": {
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
			} }
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
			"groundFloor": { "colors": {
				"light": "#70889c",
				"dark": "#3c5063"
			} }
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
			"groundFloor": { "colors": {
				"light": "#9aaab3",
				"dark": "#566774"
			} }
		}
	},
	"buildingDefaults": {
		"glass": {
			"light": "#84b8d1",
			"dark": "#31566b"
		},
		"litWindows": { "colors": [
			"#dfedfa",
			"#ffb66b",
			"#b6d9f0"
		] },
		"equipment": { "colors": {
			"light": "#9aadb9",
			"dark": "#596e7d"
		} },
		"waterproofRoof": { "colors": {
			"light": "#536d85",
			"dark": "#304459"
		} }
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
		"night": { "glow": "#dfedfa" }
	},
	"props": { "lamps": {
		"pole": {
			"light": "#536d85",
			"dark": "#304459"
		},
		"light": "#dfedfa"
	} },
	"lighting": { "shadow": { "color": "#37434d" } },
	"night": {
		"lights": {
			"street": { "color": "#dfedfa" },
			"moon": { "color": "#b5cde8" }
		},
		"ground": { "downtown": {
			"colors": [
				"#dfedfa",
				"#ffb66b",
				"#b6d9f0"
			],
			"opacity": .28
		} },
		"bloom": { "tint": "#e0edfa" }
	},
	"race": {
		"kind": "terran",
		"pad": {
			"look": "accent",
			"slot": 0
		},
		"keep": SEOUL_KEEP
	},
	"signs": {
		"colors": [
			"#ff9b45",
			"#e9f4ff",
			"#ffcb72",
			"#afd8f2",
			"#f06c35",
			"#cde5f5",
			"#e3b563",
			"#92bddc"
		],
		"nightEmission": 1
	}
};
var ZERG_DELTA = {
	"id": "zerg",
	"label": "저그 / 보랏빛 크립 군락",
	"ground": {
		"light": {
			"base": "#897053",
			"residential": "#947958",
			"commercial": "#806c52",
			"retail": "#a0845d",
			"industrial": "#79644d",
			"civic": "#ab916c",
			"hospital": "#a18e6b",
			"park": "#71734a",
			"grass": "#858250",
			"forest": "#565c39",
			"water": "#456273",
			"sidewalk": "#bea47c",
			"ballast": "#6e6455"
		},
		"dark": {
			"base": "#3c3027",
			"residential": "#44362a",
			"commercial": "#383027",
			"retail": "#4c3d2b",
			"industrial": "#352b24",
			"civic": "#544532",
			"hospital": "#4c4130",
			"park": "#343b28",
			"grass": "#40452c",
			"forest": "#272f22",
			"water": "#1e3541",
			"sidewalk": "#706044",
			"ballast": "#37352d"
		},
		"texture": {
			"size": 256,
			"pixelRatio": 2,
			"blotch": .065,
			"grain": .045,
			"crumbs": 1400,
			"pebbles": 35
		}
	},
	"roads": {
		"classes": {
			"motorway": { "colors": {
				"light": "#b9a17b",
				"dark": "#66543c"
			} },
			"primary": { "colors": {
				"light": "#bfa780",
				"dark": "#6c5a40"
			} },
			"secondary": { "colors": {
				"light": "#c6ad85",
				"dark": "#736046"
			} },
			"tertiary": { "colors": {
				"light": "#ccb48c",
				"dark": "#7a674b"
			} },
			"minor": { "colors": {
				"light": "#d1ba94",
				"dark": "#826f52"
			} },
			"service": { "colors": {
				"light": "#d8c3a0",
				"dark": "#8b795b"
			} }
		},
		"lane": {
			"colors": {
				"light": "#d5bd94",
				"dark": "#99815e"
			},
			"opacity": {
				"light": 0,
				"dark": 0
			}
		},
		"centerLine": {
			"colors": {
				"light": "#c3a87d",
				"dark": "#8e7553"
			},
			"opacity": {
				"light": 0,
				"dark": 0
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
				"pitched": { "colors": {
					"light": [
						"#936078",
						"#d0b18a",
						"#3d294b"
					],
					"dark": [
						"#674258",
						"#9b8266",
						"#291e34"
					]
				} }
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
			"groundFloor": { "colors": {
				"light": "#b7818b",
				"dark": "#805462"
			} }
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
			"awning": { "colors": {
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
			} }
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
			"groundFloor": { "colors": {
				"light": "#966176",
				"dark": "#684454"
			} }
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
			"groundFloor": { "colors": {
				"light": "#b7818b",
				"dark": "#805462"
			} }
		}
	},
	"buildingDefaults": {
		"glass": {
			"light": "#9aaf69",
			"dark": "#526c3e"
		},
		"litWindows": { "colors": [
			"#eb83b4",
			"#b6e48c",
			"#dba1cd"
		] },
		"equipment": { "colors": {
			"light": "#ad8b91",
			"dark": "#795b68"
		} },
		"waterproofRoof": { "colors": {
			"light": "#9b6478",
			"dark": "#674352"
		} }
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
		"night": { "glow": "#a6df83" }
	},
	"props": { "lamps": {
		"pole": {
			"light": "#9b6478",
			"dark": "#674352"
		},
		"light": "#a6df83"
	} },
	"lighting": { "shadow": { "color": "#2b2236" } },
	"night": {
		"lights": {
			"street": { "color": "#a6df83" },
			"moon": { "color": "#d0b9d5" }
		},
		"ground": { "downtown": {
			"colors": [
				"#eb83b4",
				"#b6e48c",
				"#dba1cd"
			],
			"opacity": .22
		} },
		"bloom": { "tint": "#e7bddb" }
	},
	"race": {
		"kind": "zerg",
		"pad": {
			"look": "accent",
			"slot": 2,
			"shape": "blob"
		},
		"keep": SEOUL_KEEP
	},
	"signs": {
		"colors": [
			"#b7eb7c",
			"#ed8ab9",
			"#91d966",
			"#d6a0d4",
			"#cae89a",
			"#e573a1",
			"#8fcf9c",
			"#f2b6d0"
		],
		"nightEmission": 1
	}
};
var PROTOSS_DELTA = {
	"id": "protoss",
	"label": "프로토스 / 상아와 수정의 도시",
	"ground": {
		"light": {
			"base": "#cbb58c",
			"residential": "#d1bd96",
			"commercial": "#c2b391",
			"retail": "#d9c29a",
			"industrial": "#bbaa89",
			"civic": "#e2cfaa",
			"hospital": "#dad1b6",
			"park": "#9b9e74",
			"grass": "#aeb184",
			"forest": "#777f5c",
			"water": "#6b95a4",
			"sidewalk": "#e9e4d2",
			"ballast": "#a59982"
		},
		"dark": {
			"base": "#4b4235",
			"residential": "#524936",
			"commercial": "#454133",
			"retail": "#5c503b",
			"industrial": "#423c31",
			"civic": "#655a42",
			"hospital": "#605d48",
			"park": "#3d432f",
			"grass": "#4a5036",
			"forest": "#2d3728",
			"water": "#233e4b",
			"sidewalk": "#888572",
			"ballast": "#4d4d40"
		},
		"texture": {
			"size": 256,
			"pixelRatio": 2,
			"blotch": .035,
			"grain": .026,
			"crumbs": 520,
			"pebbles": 9
		}
	},
	"roads": {
		"classes": {
			"motorway": { "colors": {
				"light": "#c3c5bf",
				"dark": "#646c68"
			} },
			"primary": { "colors": {
				"light": "#cdd0c8",
				"dark": "#6d7670"
			} },
			"secondary": { "colors": {
				"light": "#d5d7cd",
				"dark": "#767e76"
			} },
			"tertiary": { "colors": {
				"light": "#dcddd2",
				"dark": "#80877d"
			} },
			"minor": { "colors": {
				"light": "#e3e3d7",
				"dark": "#8a9085"
			} },
			"service": { "colors": {
				"light": "#eae9dd",
				"dark": "#94988c"
			} }
		},
		"lane": {
			"colors": {
				"light": "#e9e6d8",
				"dark": "#9faaa0"
			},
			"opacity": {
				"light": 0,
				"dark": 0
			}
		},
		"centerLine": {
			"colors": {
				"light": "#b4ac91",
				"dark": "#8e8a70"
			},
			"opacity": {
				"light": 0,
				"dark": 0
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
				"pitched": { "colors": {
					"light": [
						"#c5a358",
						"#e3d9bf",
						"#9e7a39"
					],
					"dark": [
						"#88703f",
						"#958c74",
						"#705831"
					]
				} }
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
			"groundFloor": { "colors": {
				"light": "#f0e5c8",
				"dark": "#a49a7d"
			} }
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
			"awning": { "colors": {
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
			} }
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
			"groundFloor": { "colors": {
				"light": "#dbc58c",
				"dark": "#85734c"
			} }
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
			"groundFloor": { "colors": {
				"light": "#f0e5c8",
				"dark": "#a49a7d"
			} }
		}
	},
	"buildingDefaults": {
		"glass": {
			"light": "#61c9ce",
			"dark": "#246d7b"
		},
		"litWindows": { "colors": [
			"#78e4ed",
			"#a5cef7",
			"#c5fff3"
		] },
		"equipment": { "colors": {
			"light": "#d1ba7b",
			"dark": "#968354"
		} },
		"waterproofRoof": { "colors": {
			"light": "#e2ca8b",
			"dark": "#958052"
		} }
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
		"night": { "glow": "#81e6ed" }
	},
	"props": { "lamps": {
		"pole": {
			"light": "#e2ca8b",
			"dark": "#958052"
		},
		"light": "#81e6ed"
	} },
	"lighting": { "shadow": { "color": "#4d6059" } },
	"night": {
		"lights": {
			"street": { "color": "#81e6ed" },
			"moon": { "color": "#a6dce8" }
		},
		"ground": { "downtown": {
			"colors": [
				"#78e4ed",
				"#a5cef7",
				"#c5fff3"
			],
			"opacity": .28
		} },
		"bloom": { "tint": "#b6f2f4" }
	},
	"race": {
		"kind": "protoss",
		"pad": {
			"look": "accent",
			"slot": 1,
			"shape": "octagon"
		},
		"keep": SEOUL_KEEP
	},
	"signs": {
		"colors": [
			"#72eff0",
			"#9cd8ff",
			"#51cbdc",
			"#c8fff2",
			"#91c4fa",
			"#a4f5e9",
			"#64b6e3",
			"#dbfff9"
		],
		"nightEmission": 1
	}
};
export { PROTOSS_DELTA, SEOUL_KEEP, TERRAN_DELTA, ZERG_DELTA };
