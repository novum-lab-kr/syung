// web/modes/nations/netherlands.mts
var NETHERLANDS_DELTA = {
	"id": "netherlands",
	"label": "네덜란드 / 암스테르담",
	"nation": { "kind": "netherlands" },
	"ground": {
		"light": {
			"base": "#B9B2A6",
			"residential": "#C1B5A8",
			"commercial": "#BDB3A7",
			"retail": "#C2B2A2",
			"industrial": "#ACA79F",
			"civic": "#C7BCAE",
			"hospital": "#C4BFB5",
			"park": "#7FA45A",
			"grass": "#8DB264",
			"forest": "#4F7A3E",
			"water": "#4E7D78",
			"sidewalk": "#C9BFB2",
			"ballast": "#8F8A82"
		},
		"dark": {
			"base": "#46443F",
			"residential": "#494540",
			"commercial": "#48443F",
			"retail": "#4A443E",
			"industrial": "#413F3C",
			"civic": "#4C4742",
			"hospital": "#4A4945",
			"park": "#303E22",
			"grass": "#364426",
			"forest": "#1E2E18",
			"water": "#1E302E",
			"sidewalk": "#4C4944",
			"ballast": "#363431"
		}
	},
	"roads": {
		"classes": {
			"motorway": { "colors": {
				"light": "#8E8B87",
				"dark": "#363533"
			} },
			"primary": { "colors": {
				"light": "#999590",
				"dark": "#3A3937"
			} },
			"secondary": { "colors": {
				"light": "#A39E98",
				"dark": "#3E3C3A"
			} },
			"tertiary": { "colors": {
				"light": "#ADA8A1",
				"dark": "#42403D"
			} },
			"minor": { "colors": {
				"light": "#B5AFA7",
				"dark": "#45433F"
			} },
			"service": { "colors": {
				"light": "#BCB6AE",
				"dark": "#474542"
			} }
		},
		"lane": { "colors": {
			"light": "#F2EEE6",
			"dark": "#5C5A57"
		} },
		"centerLine": { "colors": {
			"light": "#F2EEE6",
			"dark": "#5C5A57"
		} }
	},
	"buildings": {
		"house": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33",
					"#B9774F"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813",
					"#462D1E"
				]
			},
			"roof": {
				"flat": {
					"light": "#4A4E50",
					"dark": "#1C1E1E"
				},
				"variants": {
					"light": [
						"#4A4E50",
						"#3D4244",
						"#8C4B3B",
						"#5E6466"
					],
					"dark": [
						"#1C1E1E",
						"#17191A",
						"#351D16",
						"#242627"
					]
				},
				"variantWeights": [
					.4,
					.25,
					.25,
					.1
				],
				"pitched": {
					"probability": .85,
					"maxHeightM": 22,
					"areaM2": [25, 800],
					"riseMaxM": 6,
					"riseHeightRatio": .4,
					"colors": {
						"light": [
							"#3D4244",
							"#F2EEE6",
							"#2E3E44"
						],
						"dark": [
							"#17191A",
							"#5C5A57",
							"#11181A"
						]
					}
				}
			},
			"windowRatio": [.5, .62],
			"bayM": 2.4
		},
		"apartment": {
			"wall": {
				"light": [
					"#9C5A44",
					"#7C4A3C",
					"#B0694A",
					"#C9B79A"
				],
				"dark": [
					"#3B221A",
					"#2F1C17",
					"#43281C",
					"#4C463B"
				]
			},
			"roof": {
				"flat": {
					"light": "#4A4E50",
					"dark": "#1C1E1E"
				},
				"variants": {
					"light": [
						"#4A4E50",
						"#3D4244",
						"#8C4B3B",
						"#5E6466"
					],
					"dark": [
						"#1C1E1E",
						"#17191A",
						"#351D16",
						"#242627"
					]
				},
				"variantWeights": [
					.4,
					.25,
					.25,
					.1
				],
				"pitched": {
					"probability": .85,
					"maxHeightM": 22,
					"areaM2": [25, 800],
					"riseMaxM": 6,
					"riseHeightRatio": .4,
					"colors": {
						"light": [
							"#3D4244",
							"#F2EEE6",
							"#2E3E44"
						],
						"dark": [
							"#17191A",
							"#5C5A57",
							"#11181A"
						]
					}
				}
			},
			"windowRatio": [.5, .62],
			"bayM": 2.4,
			"groundFloor": { "colors": {
				"light": "#9C5A44",
				"dark": "#3B221A"
			} }
		},
		"shop": {
			"wall": {
				"light": [
					"#8E4A36",
					"#2F4F46",
					"#A5583F",
					"#E9E1CF"
				],
				"dark": [
					"#361C15",
					"#121E1B",
					"#3F2118",
					"#59564F"
				]
			},
			"roof": {
				"flat": {
					"light": "#4A4E50",
					"dark": "#1C1E1E"
				},
				"variants": {
					"light": [
						"#4A4E50",
						"#3D4244",
						"#8C4B3B",
						"#5E6466"
					],
					"dark": [
						"#1C1E1E",
						"#17191A",
						"#351D16",
						"#242627"
					]
				},
				"variantWeights": [
					.4,
					.25,
					.25,
					.1
				],
				"pitched": {
					"probability": .85,
					"maxHeightM": 22,
					"areaM2": [25, 800],
					"riseMaxM": 6,
					"riseHeightRatio": .4,
					"colors": {
						"light": [
							"#3D4244",
							"#F2EEE6",
							"#2E3E44"
						],
						"dark": [
							"#17191A",
							"#5C5A57",
							"#11181A"
						]
					}
				}
			},
			"windowRatio": [.5, .62],
			"bayM": 2.4
		},
		"office": {
			"wall": {
				"light": [
					"#7C4A3C",
					"#9C5A44",
					"#5A4A44",
					"#B9774F"
				],
				"dark": [
					"#2F1C17",
					"#3B221A",
					"#221C1A",
					"#462D1E"
				]
			},
			"roof": {
				"flat": {
					"light": "#4A4E50",
					"dark": "#1C1E1E"
				},
				"variants": {
					"light": [
						"#4A4E50",
						"#3D4244",
						"#8C4B3B",
						"#5E6466"
					],
					"dark": [
						"#1C1E1E",
						"#17191A",
						"#351D16",
						"#242627"
					]
				},
				"variantWeights": [
					.4,
					.25,
					.25,
					.1
				],
				"pitched": {
					"probability": .85,
					"maxHeightM": 22,
					"areaM2": [25, 800],
					"riseMaxM": 6,
					"riseHeightRatio": .4,
					"colors": {
						"light": [
							"#3D4244",
							"#F2EEE6",
							"#2E3E44"
						],
						"dark": [
							"#17191A",
							"#5C5A57",
							"#11181A"
						]
					}
				}
			},
			"windowRatio": [.5, .62],
			"bayM": 2.4
		},
		"industrial": {
			"wall": {
				"light": [
					"#7A5446",
					"#8E6A55",
					"#6B5A50",
					"#9C7A62"
				],
				"dark": [
					"#2E201B",
					"#362820",
					"#29221E",
					"#3B2E25"
				]
			},
			"roof": {
				"flat": {
					"light": "#4A4E50",
					"dark": "#1C1E1E"
				},
				"variants": {
					"light": [
						"#4A4E50",
						"#3D4244",
						"#8C4B3B",
						"#5E6466"
					],
					"dark": [
						"#1C1E1E",
						"#17191A",
						"#351D16",
						"#242627"
					]
				},
				"variantWeights": [
					.4,
					.25,
					.25,
					.1
				],
				"pitched": {
					"probability": .85,
					"maxHeightM": 22,
					"areaM2": [25, 800],
					"riseMaxM": 6,
					"riseHeightRatio": .4,
					"colors": {
						"light": [
							"#3D4244",
							"#F2EEE6",
							"#2E3E44"
						],
						"dark": [
							"#17191A",
							"#5C5A57",
							"#11181A"
						]
					}
				}
			},
			"windowRatio": [.5, .62],
			"bayM": 2.4,
			"groundFloor": { "colors": {
				"light": "#7A5446",
				"dark": "#2E201B"
			} }
		},
		"civic": {
			"wall": {
				"light": [
					"#A5583F",
					"#C9B79A",
					"#8E4A36",
					"#E9E1CF"
				],
				"dark": [
					"#3F2118",
					"#4C463B",
					"#361C15",
					"#59564F"
				]
			},
			"roof": {
				"flat": {
					"light": "#4A4E50",
					"dark": "#1C1E1E"
				},
				"variants": {
					"light": [
						"#4A4E50",
						"#3D4244",
						"#8C4B3B",
						"#5E6466"
					],
					"dark": [
						"#1C1E1E",
						"#17191A",
						"#351D16",
						"#242627"
					]
				},
				"variantWeights": [
					.4,
					.25,
					.25,
					.1
				],
				"pitched": {
					"probability": .85,
					"maxHeightM": 22,
					"areaM2": [25, 800],
					"riseMaxM": 6,
					"riseHeightRatio": .4,
					"colors": {
						"light": [
							"#3D4244",
							"#F2EEE6",
							"#2E3E44"
						],
						"dark": [
							"#17191A",
							"#5C5A57",
							"#11181A"
						]
					}
				}
			},
			"windowRatio": [.5, .62],
			"bayM": 2.4,
			"groundFloor": { "colors": {
				"light": "#A5583F",
				"dark": "#3F2118"
			} }
		}
	},
	"materialFamilies": {
		"navyGlass": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"silverGlass": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"blueGlass": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"ivoryStone": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"warmStone": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"redBrick": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"paintedConcrete": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"plaster": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		},
		"galvanizedMetal": {
			"wall": {
				"light": [
					"#8E4A36",
					"#A5583F",
					"#6E3F33"
				],
				"dark": [
					"#361C15",
					"#3F2118",
					"#2A1813"
				]
			},
			"glass": {
				"light": [
					"#2E3E44",
					"#3B4E55",
					"#26343A"
				],
				"dark": [
					"#11181A",
					"#161E20",
					"#0E1416"
				]
			},
			"roof": {
				"light": [
					"#4A4E50",
					"#3D4244",
					"#8C4B3B"
				],
				"dark": [
					"#1C1E1E",
					"#17191A",
					"#351D16"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.5, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			}
		}
	},
	"props": { "trees": { "colors": {
		"light": [
			"#5E8A3A",
			"#78A04A",
			"#8DB45A"
		],
		"dark": [
			"#243416",
			"#2E3D1C",
			"#364422"
		]
	} } },
	"buildingDefaults": {
		"glass": {
			"light": "#2E3E44",
			"dark": "#11181A"
		},
		"waterproofRoof": { "colors": {
			"light": "#4A4E50",
			"dark": "#1C1E1E"
		} },
		"equipment": { "colors": {
			"light": "#6B6F70",
			"dark": "#292A2B"
		} }
	}
};
export { NETHERLANDS_DELTA };
