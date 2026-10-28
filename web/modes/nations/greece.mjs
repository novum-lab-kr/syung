// web/modes/nations/greece.mts
var GREECE_DELTA = {
	"id": "greece",
	"label": "그리스 / 산토리니",
	"nation": { "kind": "greece" },
	"ground": {
		"light": {
			"base": "#E9DFC9",
			"residential": "#EDE4CF",
			"commercial": "#E4DACB",
			"retail": "#E9DCC4",
			"industrial": "#D9D1C2",
			"civic": "#EFE7D3",
			"hospital": "#E8E2D3",
			"park": "#A9B57A",
			"grass": "#B4BE83",
			"forest": "#7E8F5A",
			"water": "#2E8FC2",
			"sidewalk": "#F2ECDD",
			"ballast": "#BDB4A2"
		},
		"dark": {
			"base": "#59554C",
			"residential": "#5A574F",
			"commercial": "#57534D",
			"retail": "#59544A",
			"industrial": "#524F4A",
			"civic": "#5B5850",
			"hospital": "#585650",
			"park": "#40452E",
			"grass": "#444832",
			"forest": "#303622",
			"water": "#11364A",
			"sidewalk": "#5C5A54",
			"ballast": "#48443E"
		}
	},
	"roads": {
		"classes": {
			"motorway": { "colors": {
				"light": "#CFC7B6",
				"dark": "#4F4C45"
			} },
			"primary": { "colors": {
				"light": "#D6CEBD",
				"dark": "#514E48"
			} },
			"secondary": { "colors": {
				"light": "#DDD6C6",
				"dark": "#54514B"
			} },
			"tertiary": { "colors": {
				"light": "#E3DCCD",
				"dark": "#56544E"
			} },
			"minor": { "colors": {
				"light": "#E8E2D4",
				"dark": "#585651"
			} },
			"service": { "colors": {
				"light": "#ECE7DA",
				"dark": "#5A5853"
			} }
		},
		"lane": { "colors": {
			"light": "#FFFFFF",
			"dark": "#616161"
		} },
		"centerLine": { "colors": {
			"light": "#FFFFFF",
			"dark": "#616161"
		} }
	},
	"buildings": {
		"house": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF",
					"#E9D6A8"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161",
					"#595140"
				]
			},
			"roof": {
				"flat": {
					"light": "#F6F4EE",
					"dark": "#5D5D5A"
				},
				"variants": {
					"light": [
						"#F6F4EE",
						"#EFEBE2",
						"#E8E2D2",
						"#2F6FB0"
					],
					"dark": [
						"#5D5D5A",
						"#5B5956",
						"#585650",
						"#122A43"
					]
				},
				"variantWeights": [
					.45,
					.3,
					.15,
					.1
				],
				"pitched": {
					"probability": 0,
					"colors": {
						"light": [
							"#2F6FB0",
							"#FBF9F2",
							"#C9A46B"
						],
						"dark": [
							"#122A43",
							"#5F5F5C",
							"#4C3E29"
						]
					}
				}
			},
			"windowRatio": [.22, .3],
			"bayM": 4.2
		},
		"apartment": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F2EEE4",
					"#FFFFFF",
					"#E6C9C2"
				],
				"dark": [
					"#5F5F5C",
					"#5C5A57",
					"#616161",
					"#574C4A"
				]
			},
			"roof": {
				"flat": {
					"light": "#F6F4EE",
					"dark": "#5D5D5A"
				},
				"variants": {
					"light": [
						"#F6F4EE",
						"#EFEBE2",
						"#E8E2D2",
						"#2F6FB0"
					],
					"dark": [
						"#5D5D5A",
						"#5B5956",
						"#585650",
						"#122A43"
					]
				},
				"variantWeights": [
					.45,
					.3,
					.15,
					.1
				],
				"pitched": {
					"probability": 0,
					"colors": {
						"light": [
							"#2F6FB0",
							"#FBF9F2",
							"#C9A46B"
						],
						"dark": [
							"#122A43",
							"#5F5F5C",
							"#4C3E29"
						]
					}
				}
			},
			"windowRatio": [.22, .3],
			"bayM": 4.2,
			"groundFloor": { "colors": {
				"light": "#FBF9F2",
				"dark": "#5F5F5C"
			} }
		},
		"shop": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#9CC9DA",
					"#F2EEE4",
					"#E9D6A8"
				],
				"dark": [
					"#5F5F5C",
					"#3B4C53",
					"#5C5A57",
					"#595140"
				]
			},
			"roof": {
				"flat": {
					"light": "#F6F4EE",
					"dark": "#5D5D5A"
				},
				"variants": {
					"light": [
						"#F6F4EE",
						"#EFEBE2",
						"#E8E2D2",
						"#2F6FB0"
					],
					"dark": [
						"#5D5D5A",
						"#5B5956",
						"#585650",
						"#122A43"
					]
				},
				"variantWeights": [
					.45,
					.3,
					.15,
					.1
				],
				"pitched": {
					"probability": 0,
					"colors": {
						"light": [
							"#2F6FB0",
							"#FBF9F2",
							"#C9A46B"
						],
						"dark": [
							"#122A43",
							"#5F5F5C",
							"#4C3E29"
						]
					}
				}
			},
			"windowRatio": [.22, .3],
			"bayM": 4.2
		},
		"office": {
			"wall": {
				"light": [
					"#F7F5EE",
					"#ECE8DE",
					"#FFFFFF",
					"#DCE6EA"
				],
				"dark": [
					"#5E5D5A",
					"#5A5854",
					"#616161",
					"#545759"
				]
			},
			"roof": {
				"flat": {
					"light": "#F6F4EE",
					"dark": "#5D5D5A"
				},
				"variants": {
					"light": [
						"#F6F4EE",
						"#EFEBE2",
						"#E8E2D2",
						"#2F6FB0"
					],
					"dark": [
						"#5D5D5A",
						"#5B5956",
						"#585650",
						"#122A43"
					]
				},
				"variantWeights": [
					.45,
					.3,
					.15,
					.1
				],
				"pitched": {
					"probability": 0,
					"colors": {
						"light": [
							"#2F6FB0",
							"#FBF9F2",
							"#C9A46B"
						],
						"dark": [
							"#122A43",
							"#5F5F5C",
							"#4C3E29"
						]
					}
				}
			},
			"windowRatio": [.22, .3],
			"bayM": 4.2
		},
		"industrial": {
			"wall": {
				"light": [
					"#EDE9DF",
					"#E2DDD2",
					"#D8D2C5",
					"#F4F0E6"
				],
				"dark": [
					"#5A5955",
					"#565450",
					"#52504B",
					"#5D5B57"
				]
			},
			"roof": {
				"flat": {
					"light": "#F6F4EE",
					"dark": "#5D5D5A"
				},
				"variants": {
					"light": [
						"#F6F4EE",
						"#EFEBE2",
						"#E8E2D2",
						"#2F6FB0"
					],
					"dark": [
						"#5D5D5A",
						"#5B5956",
						"#585650",
						"#122A43"
					]
				},
				"variantWeights": [
					.45,
					.3,
					.15,
					.1
				],
				"pitched": {
					"probability": 0,
					"colors": {
						"light": [
							"#2F6FB0",
							"#FBF9F2",
							"#C9A46B"
						],
						"dark": [
							"#122A43",
							"#5F5F5C",
							"#4C3E29"
						]
					}
				}
			},
			"windowRatio": [.22, .3],
			"bayM": 4.2,
			"groundFloor": { "colors": {
				"light": "#EDE9DF",
				"dark": "#5A5955"
			} }
		},
		"civic": {
			"wall": {
				"light": [
					"#FFFFFF",
					"#F7F2E6",
					"#EEE6D4",
					"#E9D6A8"
				],
				"dark": [
					"#616161",
					"#5E5C57",
					"#5A5751",
					"#595140"
				]
			},
			"roof": {
				"flat": {
					"light": "#F6F4EE",
					"dark": "#5D5D5A"
				},
				"variants": {
					"light": [
						"#F6F4EE",
						"#EFEBE2",
						"#E8E2D2",
						"#2F6FB0"
					],
					"dark": [
						"#5D5D5A",
						"#5B5956",
						"#585650",
						"#122A43"
					]
				},
				"variantWeights": [
					.45,
					.3,
					.15,
					.1
				],
				"pitched": {
					"probability": 0,
					"colors": {
						"light": [
							"#2F6FB0",
							"#FBF9F2",
							"#C9A46B"
						],
						"dark": [
							"#122A43",
							"#5F5F5C",
							"#4C3E29"
						]
					}
				}
			},
			"windowRatio": [.22, .3],
			"bayM": 4.2,
			"groundFloor": { "colors": {
				"light": "#FFFFFF",
				"dark": "#616161"
			} }
		}
	},
	"materialFamilies": {
		"navyGlass": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"silverGlass": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"blueGlass": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"ivoryStone": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"warmStone": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"redBrick": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"paintedConcrete": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"plaster": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		},
		"galvanizedMetal": {
			"wall": {
				"light": [
					"#FBF9F2",
					"#F4F0E6",
					"#FFFFFF"
				],
				"dark": [
					"#5F5F5C",
					"#5D5B57",
					"#616161"
				]
			},
			"glass": {
				"light": [
					"#2B5F8F",
					"#2F6FB0",
					"#24496B"
				],
				"dark": [
					"#102436",
					"#122A43",
					"#0E1C29"
				]
			},
			"roof": {
				"light": [
					"#F6F4EE",
					"#EFEBE2",
					"#E8E2D2"
				],
				"dark": [
					"#5D5D5A",
					"#5B5956",
					"#585650"
				]
			},
			"facade": {
				"pattern": "punched",
				"windowRatio": [.22, .3],
				"reflectionScale": .04,
				"bayM": 4.2
			}
		}
	},
	"props": { "trees": { "colors": {
		"light": [
			"#6B7F4A",
			"#7F935A",
			"#97A86E"
		],
		"dark": [
			"#29301C",
			"#303822",
			"#39402A"
		]
	} } },
	"buildingDefaults": {
		"glass": {
			"light": "#2B5F8F",
			"dark": "#102436"
		},
		"waterproofRoof": { "colors": {
			"light": "#F6F4EE",
			"dark": "#5D5D5A"
		} },
		"equipment": { "colors": {
			"light": "#E2DDD2",
			"dark": "#565450"
		} }
	}
};
export { GREECE_DELTA };
