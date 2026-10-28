// web/modes/basic/city.mts
var SEOUL_CITY_STYLE = {
	"schemaVersion": 1,
	"id": "seoul",
	"label": "서울 / 심시티",
	"classification": {
		"minimumHeightM": 3,
		"missingHeightM": 9,
		"unknownLanduse": "unknown",
		"overlappingLanduse": "smallest-containing-area",
		"equalAreaPriority": [
			"school",
			"hospital",
			"university",
			"college",
			"civic",
			"public",
			"industrial",
			"retail",
			"commercial",
			"residential"
		],
		"rules": [
			{
				"type": "civic",
				"landuse": [
					"school",
					"university",
					"college",
					"hospital",
					"civic",
					"public"
				]
			},
			{
				"type": "industrial",
				"landuse": ["industrial", "railway"],
				"maxHeightM": 32
			},
			{
				"type": "apartment",
				"landuse": ["residential"],
				"minHeightM": 18,
				"minAreaM2": 300
			},
			{
				"type": "office",
				"minHeightM": 45
			},
			{
				"type": "office",
				"landuse": ["commercial"],
				"minHeightM": 24
			},
			{
				"type": "house",
				"maxHeightM": 15,
				"maxAreaM2": 450,
				"excludedLanduse": [
					"retail",
					"commercial",
					"industrial"
				]
			},
			{ "type": "shop" }
		],
		"mergedLowrise": {
			"maxHeightM": 15,
			"areaGreaterThanM2": 1200,
			"facadePanelM": [8, 14],
			"allowPitchedRoof": false
		}
	},
	"buildingDefaults": {
		"opacity": 1,
		"wallWeights": [
			.4,
			.3,
			.2,
			.1
		],
		"parapetThicknessM": .18,
		"roofEquipmentEdgeClearanceM": .6,
		"glass": {
			"light": "#5B7684",
			"dark": "#1B2B33"
		},
		"litWindows": {
			"kelvin": [
				2700,
				3500,
				4500
			],
			"colors": [
				"#FFD59A",
				"#FFE7BD",
				"#DDEAF0"
			],
			"emission": .7,
			"groundFloorEmission": .9,
			"floorProbabilityMultiplier": [.65, 1.2],
			"seed": "building-floor-bay",
			"bloom": false
		},
		"equipment": {
			"minZoom": 16,
			"minHeightM": 12,
			"minAreaM2": 120,
			"penthouseCount": 1,
			"penthouseAreaRatio": [.04, .07],
			"penthouseHeightM": 1.8,
			"hvacCount": [1, 3],
			"hvacSizeM": [
				1.6,
				1,
				.9
			],
			"maxRoofAreaRatio": .12,
			"colors": {
				"light": "#C0CAC7",
				"dark": "#4D5C59"
			}
		},
		"waterproofRoof": {
			"maxHeightM": 15,
			"probability": .18,
			"colors": {
				"light": "#71917D",
				"dark": "#3A5047"
			}
		},
		"windowCellMinPx": 1.25,
		"windowBandMinPx": .65
	},
	"buildings": {
		"house": {
			"wall": {
				"light": [
					"#BA8069",
					"#CEA083",
					"#E0CEB3",
					"#C7C6B5"
				],
				"dark": [
					"#51443E",
					"#5C4B40",
					"#625D50",
					"#504F46"
				]
			},
			"roof": {
				"flat": {
					"light": "#8A9291",
					"dark": "#333D3A"
				},
				"parapetM": .35,
				"pitched": {
					"probability": .2,
					"maxHeightM": 9,
					"areaM2": [45, 180],
					"riseMaxM": 2.2,
					"riseHeightRatio": .2,
					"colors": {
						"light": [
							"#855B49",
							"#656F68",
							"#9D7658"
						],
						"dark": [
							"#483B34",
							"#354642",
							"#564533"
						]
					},
					"weights": [
						.55,
						.3,
						.15
					]
				},
				"variants": {
					"light": [
						"#919B9A",
						"#607B93",
						"#A56650",
						"#C5C6B9"
					],
					"dark": [
						"#414F50",
						"#2D4356",
						"#533A32",
						"#5C6259"
					]
				},
				"variantWeights": [
					.35,
					.25,
					.25,
					.15
				]
			},
			"floorM": 3,
			"bayM": 3,
			"windowRatio": [.42, .48],
			"pattern": "punched",
			"baysPerGroup": [2, 4],
			"groundFloor": {
				"heightM": 3,
				"glassRatio": .42
			},
			"night": {
				"litRatio": .42,
				"temperatureWeights": [
					.75,
					.22,
					.03
				]
			},
			"materialMix": [
				{
					"family": "redBrick",
					"weight": .5
				},
				{
					"family": "plaster",
					"weight": .3
				},
				{
					"family": "paintedConcrete",
					"weight": .2
				}
			]
		},
		"apartment": {
			"wall": {
				"light": [
					"#E4E5DD",
					"#D0DBD8",
					"#ECE4D3",
					"#BACACD"
				],
				"dark": [
					"#555E60",
					"#48585B",
					"#646662",
					"#465557"
				]
			},
			"roof": {
				"flat": {
					"light": "#A1B2B5",
					"dark": "#36484A"
				},
				"parapetM": .55,
				"variants": {
					"light": [
						"#ACBCBE",
						"#7F99AD",
						"#CCCAB9",
						"#8C9E91"
					],
					"dark": [
						"#4B5E65",
						"#354F62",
						"#626357",
						"#3E5147"
					]
				},
				"variantWeights": [
					.4,
					.3,
					.2,
					.1
				]
			},
			"floorM": 2.9,
			"bayM": 3.2,
			"windowRatio": [.56, .6],
			"pattern": "vertical-balconies",
			"balconyEveryBays": 3,
			"balconyBrightness": 1.07,
			"groundFloor": {
				"heightM": 3.2,
				"glassRatio": .56,
				"colors": {
					"light": "#B0B6B0",
					"dark": "#3F5052"
				}
			},
			"night": {
				"litRatio": .48,
				"temperatureWeights": [
					.65,
					.3,
					.05
				]
			},
			"materialMix": [
				{
					"family": "paintedConcrete",
					"weight": .6
				},
				{
					"family": "ivoryStone",
					"weight": .22
				},
				{
					"family": "warmStone",
					"weight": .1
				},
				{
					"family": "redBrick",
					"weight": .08
				}
			]
		},
		"shop": {
			"wall": {
				"light": [
					"#DDC9AA",
					"#C8AE8D",
					"#ECE0C7",
					"#BFCBC6"
				],
				"dark": [
					"#5E5549",
					"#514B43",
					"#676257",
					"#4B5352"
				]
			},
			"roof": {
				"flat": {
					"light": "#A0A89D",
					"dark": "#383F3D"
				},
				"parapetM": .55,
				"variants": {
					"light": [
						"#9AA5A6",
						"#6B849A",
						"#A97758",
						"#C7CBBB"
					],
					"dark": [
						"#475456",
						"#334859",
						"#594231",
						"#5D6559"
					]
				},
				"variantWeights": [
					.35,
					.25,
					.25,
					.15
				]
			},
			"floorM": 3.5,
			"bayM": 3,
			"windowRatio": [.66, .57],
			"pattern": "horizontal-bands",
			"spandrelM": .4,
			"groundFloor": {
				"heightM": 4.2,
				"glassRatio": .72,
				"storefrontLanduse": ["commercial", "retail"]
			},
			"awning": {
				"minZoom": 16.5,
				"landuse": ["retail", "commercial"],
				"probability": .35,
				"frontageRatio": [.5, .7],
				"depthM": .8,
				"heightM": .25,
				"baseM": 3.1,
				"colors": {
					"light": [
						"#9C614D",
						"#667C6B",
						"#C2AC76"
					],
					"dark": [
						"#583D33",
						"#354D40",
						"#65573A"
					]
				},
				"weights": [
					.45,
					.35,
					.2
				]
			},
			"night": {
				"litRatio": .38,
				"groundFloorLitRatio": .78,
				"temperatureWeights": [
					.55,
					.35,
					.1
				]
			},
			"materialMix": [
				{
					"family": "ivoryStone",
					"weight": .25
				},
				{
					"family": "warmStone",
					"weight": .3
				},
				{
					"family": "redBrick",
					"weight": .25
				},
				{
					"family": "paintedConcrete",
					"weight": .12
				},
				{
					"family": "silverGlass",
					"weight": .08
				}
			]
		},
		"office": {
			"wall": {
				"light": [
					"#8AA8B9",
					"#CBDADF",
					"#B4C3C9",
					"#B7B4A3"
				],
				"dark": [
					"#344D58",
					"#405D65",
					"#2C444F",
					"#536B6E"
				]
			},
			"roof": {
				"flat": {
					"light": "#8FA7B4",
					"dark": "#293D46"
				},
				"parapetM": .65,
				"variants": {
					"light": [
						"#9AAFBF",
						"#5C748C",
						"#CFD5D3",
						"#A99171"
					],
					"dark": [
						"#405665",
						"#293E52",
						"#5B676D",
						"#4F463A"
					]
				},
				"variantWeights": [
					.4,
					.3,
					.2,
					.1
				]
			},
			"floorM": 3.6,
			"bayM": 1.8,
			"windowRatio": [.82, .8],
			"pattern": "curtain-wall",
			"glass": {
				"light": "#82A5BA",
				"dark": "#233D49"
			},
			"mullionM": .1,
			"beltEveryFloors": 6,
			"beltHeightM": .5,
			"groundFloor": {
				"heightM": 4.8,
				"glassRatio": .78
			},
			"setback": {
				"minHeightM": 80,
				"minAreaM2": 600,
				"probability": .35,
				"topHeightRatio": .15,
				"maxInsetM": 1.5
			},
			"night": {
				"litRatio": .22,
				"groundFloorLitRatio": .45,
				"temperatureWeights": [
					.2,
					.65,
					.15
				],
				"windowRatio": [.72, .62],
				"emission": .5,
				"groundFloorEmission": .72,
				"floorProbabilityMultiplier": [.55, 1.15],
				"brightnessTiers": {
					"multipliers": [
						.55,
						.8,
						1.1
					],
					"weights": [
						.5,
						.4,
						.1
					]
				},
				"targetLitFacadeAreaRatio": [.06, .11],
				"maxContiguousLitBays": 3
			},
			"materialMix": [
				{
					"family": "navyGlass",
					"weight": .24
				},
				{
					"family": "silverGlass",
					"weight": .22
				},
				{
					"family": "blueGlass",
					"weight": .14
				},
				{
					"family": "ivoryStone",
					"weight": .2
				},
				{
					"family": "warmStone",
					"weight": .12
				},
				{
					"family": "redBrick",
					"weight": .08
				}
			],
			"dayReflection": {
				"enabled": true,
				"space": "linear-srgb",
				"skyHorizon": "#EEF3F1",
				"skyZenith": "#C5E4F7",
				"heightRangeRatio": [.15, .95],
				"mixByHeight": [.06, .2],
				"faceStrengthRange": [.65, 1],
				"maxMix": .24,
				"diffuseRangeLinear": [.66, 1.04],
				"bandWidthRatio": [.2, .35],
				"bandDeltaLStar": [4, 7],
				"seed": "building-family-face",
				"animated": false
			},
			"articulation": {
				"minHeightM": 60,
				"replacesLegacySetback": true,
				"crownWeights": {
					"flatBand": .5,
					"insetCap": .3,
					"steppedCap": .2
				},
				"topZoneHeightRatio": [.06, .1],
				"maxTopZoneHeightM": 4.5,
				"maxInsetM": 1.2,
				"keepOriginalMaxHeight": true,
				"beltEveryFloors": [
					6,
					8,
					10
				],
				"beltHeightM": [.35, .55],
				"cornerWidthM": [.35, .65],
				"cornerDeltaLStar": [5, 9],
				"crownDeltaLStar": [8, 14],
				"maxAccentFacadeAreaRatio": .06,
				"minDetailZoom": 16.5
			}
		},
		"industrial": {
			"wall": {
				"light": [
					"#C4CFCD",
					"#ACBFCA",
					"#D4CBB8",
					"#95AAA9"
				],
				"dark": [
					"#485354",
					"#3D4F51",
					"#57554B",
					"#354C4F"
				]
			},
			"roof": {
				"flat": {
					"light": "#95ABB8",
					"dark": "#334951"
				},
				"parapetM": .3,
				"panel": {
					"minZoom": 16.5,
					"spacingM": 4,
					"contrastRatio": .08,
					"slopeRiseM": .8
				},
				"variants": {
					"light": [
						"#9FB9C9",
						"#718FA4",
						"#B97657",
						"#C5CECB"
					],
					"dark": [
						"#44616F",
						"#30495C",
						"#5A3E31",
						"#596762"
					]
				},
				"variantWeights": [
					.35,
					.25,
					.25,
					.15
				]
			},
			"floorM": 4.5,
			"bayM": 5,
			"windowRatio": [.68, .24],
			"pattern": "clerestory",
			"ribSpacingM": 5,
			"groundFloor": {
				"heightM": 4.5,
				"glassRatio": .24,
				"colors": {
					"light": "#88908B",
					"dark": "#344548"
				}
			},
			"night": {
				"litRatio": .12,
				"temperatureWeights": [
					.2,
					.5,
					.3
				]
			},
			"materialMix": [
				{
					"family": "galvanizedMetal",
					"weight": .7
				},
				{
					"family": "paintedConcrete",
					"weight": .2
				},
				{
					"family": "redBrick",
					"weight": .1
				}
			]
		},
		"civic": {
			"wall": {
				"light": [
					"#E4D5B8",
					"#D1CBB7",
					"#F0E2C9",
					"#C2D2C3"
				],
				"dark": [
					"#625D50",
					"#53574D",
					"#6B6455",
					"#4C5C55"
				]
			},
			"roof": {
				"flat": {
					"light": "#ACAD99",
					"dark": "#3B4741"
				},
				"parapetM": .65,
				"variants": {
					"light": [
						"#A8B8BC",
						"#7C94A6",
						"#B28261",
						"#C9CBB9"
					],
					"dark": [
						"#495C64",
						"#354C5D",
						"#604934",
						"#5E6658"
					]
				},
				"variantWeights": [
					.35,
					.25,
					.25,
					.15
				]
			},
			"floorM": 3.6,
			"bayM": 3.2,
			"windowRatio": [.53, .6],
			"pattern": "regular-grid",
			"groundFloor": {
				"heightM": 4,
				"glassRatio": .53,
				"colors": {
					"light": "#BBB39E",
					"dark": "#484D44"
				}
			},
			"night": {
				"litRatio": .2,
				"landuseLitRatio": { "hospital": .48 },
				"temperatureWeights": [
					.15,
					.5,
					.35
				]
			},
			"materialMix": [
				{
					"family": "ivoryStone",
					"weight": .45
				},
				{
					"family": "warmStone",
					"weight": .25
				},
				{
					"family": "redBrick",
					"weight": .2
				},
				{
					"family": "paintedConcrete",
					"weight": .1
				}
			]
		}
	},
	"ground": {
		"aliases": {
			"unknown": "base",
			"railway": "industrial",
			"university": "civic",
			"college": "civic",
			"school": "civic",
			"public": "civic"
		},
		"light": {
			"base": "#E0E4DC",
			"residential": "#DCE2D0",
			"commercial": "#D5DCD9",
			"retail": "#E2D8C3",
			"industrial": "#C7D2D0",
			"civic": "#E7DDC5",
			"hospital": "#DEE7DA",
			"park": "#9DBC83",
			"grass": "#AEC98E",
			"forest": "#6F965C",
			"water": "#79B2CB",
			"sidewalk": "#ECE7D8",
			"ballast": "#9BA4A4"
		},
		"dark": {
			"base": "#202C31",
			"residential": "#26332F",
			"commercial": "#2C3337",
			"retail": "#343530",
			"industrial": "#29363A",
			"civic": "#343C34",
			"hospital": "#2F3D39",
			"park": "#274535",
			"grass": "#304A35",
			"forest": "#1F392E",
			"water": "#173B4B",
			"sidewalk": "#3D4543",
			"ballast": "#364146"
		},
		"waterReflectionMaxOpacity": .06,
		"ride": {
			"light": {
				"base": "#C9C7BC",
				"residential": "#CACDBF",
				"commercial": "#C6CAC4",
				"retail": "#CEC6B3",
				"industrial": "#BCC2BF",
				"civic": "#D0C8B3",
				"hospital": "#CBD1C5"
			},
			"dark": {
				"base": "#273034",
				"residential": "#2B3633",
				"commercial": "#30373A",
				"retail": "#373832",
				"industrial": "#2D393C",
				"civic": "#373F37",
				"hospital": "#32403C"
			}
		}
	},
	"roads": {
		"aliases": { "trunk": "motorway" },
		"classes": {
			"motorway": {
				"widthM": 26,
				"sidewalkM": 0,
				"colors": {
					"light": "#79868E",
					"dark": "#26353D"
				}
			},
			"primary": {
				"widthM": 22,
				"sidewalkM": 3,
				"colors": {
					"light": "#859299",
					"dark": "#2E3D43"
				}
			},
			"secondary": {
				"widthM": 16,
				"sidewalkM": 2.5,
				"colors": {
					"light": "#939FA1",
					"dark": "#334146"
				}
			},
			"tertiary": {
				"widthM": 11,
				"sidewalkM": 2,
				"colors": {
					"light": "#A3ACA8",
					"dark": "#37454A"
				}
			},
			"minor": {
				"widthM": 6,
				"sidewalkM": 1.4,
				"colors": {
					"light": "#B8C0B5",
					"dark": "#3F4B49"
				}
			},
			"service": {
				"widthM": 3.5,
				"sidewalkM": .8,
				"colors": {
					"light": "#C6CABE",
					"dark": "#46524D"
				}
			}
		},
		"lane": {
			"minZoom": 16.2,
			"minRoadWidthPx": 10,
			"classes": [
				"primary",
				"secondary",
				"tertiary"
			],
			"dashM": 3,
			"gapM": 5,
			"widthM": .12,
			"colors": {
				"light": "#D8D7BD",
				"dark": "#727C77"
			},
			"opacity": {
				"light": .65,
				"dark": .45
			}
		},
		"centerLine": {
			"widthM": .14,
			"colors": {
				"light": "#CBB66D",
				"dark": "#827B50"
			}
		},
		"crossing": {
			"minZoom": 17,
			"stripeM": .5,
			"gapM": .5,
			"depthM": 3,
			"cornerSetbackM": 2,
			"requireVerifiedIntersection": true
		}
	},
	"props": {
		"trees": {
			"streetSpacingM": {
				"primary": 18,
				"secondary": 16,
				"tertiary": 14
			},
			"streetHeightM": [5.5, 8],
			"streetCrownDiameterM": [3.2, 4.8],
			"trunkDiameterM": .24,
			"shapeWeights": {
				"rounded": .7,
				"upright": .3
			},
			"colors": {
				"light": [
					"#5B824D",
					"#79A45D",
					"#98B96C"
				],
				"dark": [
					"#213F30",
					"#2B4D35",
					"#3C5840"
				]
			},
			"weights": [
				.35,
				.45,
				.2
			],
			"trunk": {
				"light": "#766854",
				"dark": "#39443A"
			},
			"parkAreaPerTreeM2": 180,
			"parkMinSpacingM": 7,
			"parkHeightM": [6, 10],
			"parkCrownDiameterM": [4, 6],
			"maxVisible": {
				"desktop": 900,
				"phone": 360
			}
		},
		"lamps": {
			"spacingM": 28,
			"minorSpacingM": 42,
			"primaryStaggerM": 14,
			"intersectionClearanceM": 6,
			"heightM": 7,
			"armM": 1.2,
			"poleDiameterM": .12,
			"pole": {
				"light": "#6E7873",
				"dark": "#3C4C4F"
			},
			"kelvin": 3e3,
			"light": "#FFD79B",
			"poolRadiusM": 3.2,
			"poolOpacity": .1,
			"simcityPoolMaxOpacity": .14
		},
		"vehicles": {
			"carSizeM": [
				4.3,
				1.8,
				1.45
			],
			"suvSizeM": [
				4.8,
				1.9,
				1.7
			],
			"suvRatio": .2,
			"colors": [
				"#DDDCD0",
				"#A6AFAC",
				"#43545B",
				"#C88753",
				"#527E95",
				"#A96655"
			],
			"weights": [
				.36,
				.25,
				.22,
				.09,
				.05,
				.03
			],
			"bus": {
				"ratio": .04,
				"sizeM": [
					10.5,
					2.4,
					3.1
				],
				"colors": ["#326B9D", "#5A8858"],
				"weights": [.7, .3],
				"minZoom": 16.7
			},
			"per100M": {
				"primary": 2.5,
				"secondary": 2,
				"tertiary": 1.3,
				"minor": .6,
				"service": .2
			},
			"laneOffsetWidthRatio": .22,
			"trafficSide": "right",
			"intersectionClearanceM": 8,
			"maxVisible": {
				"desktop": 240,
				"phone": 90
			},
			"speedMps": [6, 10],
			"headlights": "#FFE2AC",
			"taillights": "#BF4E39",
			"beamMaxM": 2,
			"beamMaxOpacity": .2
		},
		"people": {
			"heightM": 1.7,
			"shoulderM": .45,
			"per100M": {
				"retail": 7,
				"commercial": 7,
				"residential": 3,
				"park": 4,
				"industrial": 1
			},
			"clothes": [
				"#667C89",
				"#AC7D65",
				"#D0BB8D",
				"#596951"
			],
			"skin": {
				"light": "#C79D7D",
				"dark": "#755D4B"
			},
			"maxVisible": {
				"desktop": 160,
				"phone": 50
			},
			"speedMps": [.8, 1.2]
		}
	},
	"lighting": {
		"light": {
			"ambient": .64,
			"directional": .36,
			"color": "#FFF9F2",
			"maxSideDarken": .34,
			"maxRoofBrighten": .12
		},
		"dark": {
			"ambient": .72,
			"directional": .28,
			"color": "#BCD0D6"
		},
		"shadow": {
			"color": "#394D4B",
			"maxLengthM": 80,
			"featherM": .8
		},
		"ao": {
			"opacity": .1,
			"widthM": .5
		},
		"referenceSun": {
			"azimuthDeg": 225,
			"elevationDeg": 42
		}
	},
	"modes": {
		"simcity": {
			"saturation": {
				"light": 1,
				"dark": 1
			},
			"brightness": {
				"light": 1,
				"dark": 1
			},
			"windowEmission": 1,
			"lampPool": 1,
			"shadowOpacity": {
				"light": .18,
				"dark": .08
			}
		},
		"coaster": {
			"saturation": {
				"light": .82,
				"dark": .65
			},
			"brightness": {
				"light": 1,
				"dark": .9
			},
			"windowEmission": .82,
			"lampPool": .75,
			"shadowOpacity": {
				"light": .14,
				"dark": .06
			}
		},
		"colorMath": {
			"space": "linear-srgb",
			"lumaWeights": [
				.2126,
				.7152,
				.0722
			]
		},
		"transitionMs": 180
	},
	"night": {
		"lights": {
			"litRatioMul": 1.2,
			"litRatioMax": .8,
			"emissionMul": 1.5,
			"groundEmissionMul": 1.7,
			"groundLitMul": 1.35,
			"groundLitMax": .9,
			"signMul": 1.2,
			"moon": {
				"color": "#AFC3E0",
				"k": .6,
				"roofK": .8
			},
			"farGlow": .6,
			"street": {
				"color": "#FFC88E",
				"strength": 1.6,
				"heightM": 3.5
			},
			"lampPool": {
				"opacity": .3,
				"radiusMul": 2.6,
				"lod": [14.5, 15.1]
			},
			"carBeam": {
				"opacity": .3,
				"minZoom": 16
			}
		},
		"ground": { "downtown": {
			"colors": [
				"#FF8A3D",
				"#FFB070",
				"#FFDDB0"
			],
			"opacity": .35,
			"radiusM": 45,
			"intensity": .9,
			"minZoom": 13
		} },
		"bloom": {
			"strength": 1.8,
			"threshold": .68,
			"knee": .06,
			"levels": 4,
			"tint": "#FFFFFF",
			"phone": false,
			"overlay": {
				"strength": 1.2,
				"threshold": .86
			}
		}
	},
	"lod": {
		"windows": [15, 16],
		"roofEquipment": [16, 16.5],
		"streetTrees": [15.2, 16],
		"parkTrees": [14.7, 15.5],
		"lamps": [16, 16.8],
		"vehicles": [16, 16.8],
		"people": [17.2, 18],
		"fade": "smoothstep",
		"reducedMotion": "static-props"
	},
	"train": { "coaster88": {
		"bodyColors": {
			"cream": "#F4E4BC",
			"red": "#C94235",
			"gold": "#E9AF32",
			"teal": "#244D56"
		},
		"bodyAreaWeights": {
			"cream": .5,
			"red": .3,
			"gold": .12,
			"teal": .08
		},
		"seat": "#723C31",
		"safetyBar": "#C5C4B2",
		"chassis": "#293A3F",
		"stripeHeightRatio": [.08, .12],
		"maxRouteColorAreaRatio": .08,
		"nightMinBodyLight": .55,
		"bulbColor": "#FFD27E",
		"bulbEmission": .85
	} },
	"facadeFaces": {
		"neighbourGapM": 3,
		"openDistanceM": 8,
		"minFaceWidthM": 6,
		"slabAspect": 1.5,
		"primaryOnlyMaxAreaM2": 600,
		"windowScale": {
			"house": .9,
			"apartment": .92,
			"shop": .85,
			"office": 1,
			"industrial": 1,
			"civic": .9
		},
		"minPierM": {
			"house": 1.2,
			"apartment": 1.4,
			"shop": 1.3,
			"office": 1.1,
			"industrial": 1.5,
			"civic": 1.3
		},
		"byType": {
			"house": {
				"abutting": "blank",
				"near": "sparse",
				"open": "full",
				"primaryOnly": true
			},
			"shop": {
				"abutting": "blank",
				"near": "sparse",
				"open": "full",
				"primaryOnly": true
			},
			"apartment": {
				"abutting": "blank",
				"near": "full",
				"open": "full",
				"shortFaces": "single"
			},
			"office": {
				"glass": "full",
				"masonry": {
					"abutting": "blank",
					"near": "full",
					"open": "full",
					"shortFaces": "sparse",
					"windowScale": .85
				}
			},
			"industrial": {
				"abutting": "blank",
				"near": "full",
				"open": "full",
				"shortFaces": "sparse"
			},
			"civic": {
				"abutting": "blank",
				"near": "full",
				"open": "full",
				"shortFaces": "sparse"
			}
		}
	},
	"signs": {
		"types": ["shop"],
		"minHeightM": 4,
		"maxHeightM": 32,
		"probability": .8,
		"maxWalls": 2,
		"minWallM": 4,
		"fascia": {
			"heightM": .9,
			"depthM": .22,
			"belowM": .1,
			"gapM": .35,
			"shopM": 7,
			"maxShops": 3
		},
		"upper": {
			"probability": .55,
			"maxFloors": 3,
			"heightM": .8,
			"depthM": .1,
			"offsetM": .15,
			"frontage": [.45, .85]
		},
		"blade": {
			"probability": .6,
			"minHeightM": 8,
			"widthM": .3,
			"outM": 1,
			"insetM": .5,
			"baseAboveM": .6,
			"heightM": [3, 9]
		},
		"colors": [
			"#C8372D",
			"#2B5DB0",
			"#F1EFE8",
			"#E6962A",
			"#2F8A55",
			"#24282B",
			"#E4612B",
			"#22406B"
		],
		"weights": [
			.18,
			.18,
			.16,
			.1,
			.12,
			.1,
			.08,
			.08
		],
		"ink": {
			"light": "#F7F5EE",
			"dark": "#1E2326"
		},
		"nightEmission": .95
	},
	"xray": {
		"alpha": .3,
		"edgeAlpha": .75,
		"edgePx": 1.5,
		"featherPx": 24,
		"fadeMs": 200,
		"maxTargets": 48,
		"pieceM": 30,
		"platformMarginM": 4,
		"platformBelowM": 2.5,
		"platformAboveM": 6,
		"trainHalfWidthM": 3,
		"trainBelowM": 1,
		"trainAboveM": 4.5,
		"trains": true
	},
	"throughBuildings": {
		"railHeightM": 11,
		"bandBelowM": 2,
		"bandAboveM": 4.6,
		"glass": {
			"light": "#A9CBD8",
			"dark": "#2C414C"
		},
		"frame": {
			"light": "#55626A",
			"dark": "#262E33"
		},
		"mullionEveryM": 1.5,
		"mullionM": .08,
		"skyMix": .4,
		"portalHalfM": 12,
		"alongsideM": 20,
		"insideLight": "#F3ECDA",
		"insideMix": .3,
		"nightEmission": 1.15,
		"depthOpen": true
	},
	"viaduct": {
		"railHeightM": 11.3,
		"lineStepM": .03,
		"deckThicknessM": 1.6,
		"parapetHeightM": 1.1,
		"parapetPx": 2,
		"marginPx": 1.5,
		"lowZoomLanePx": 2,
		"lowZoomBodyPx": 4,
		"widthZoom": [15, 16],
		"bedWidthRatio": .55,
		"railGaugeRatio": .3,
		"railPx": .9,
		"elevatedConcreteK": .88,
		"pier": {
			"everyM": 28,
			"searchM": 12,
			"sideM": 2.2,
			"minPx": 1.6,
			"capDepthM": 1.4,
			"capLengthM": 1.8,
			"capOverhangPx": .6
		},
		"station": {
			"platformRiseM": .3,
			"floorM": .5,
			"platformDepthRatio": .6,
			"gapPx": .6,
			"canopyHeightM": 4.2,
			"canopyThicknessM": .3,
			"canopyInsetM": 6,
			"canopyOverhangPx": .6,
			"postEveryM": 10,
			"postM": .3,
			"postPx": 1,
			"postInsetPx": 1
		},
		"colors": {
			"light": {
				"concrete": "#C9CBC4",
				"under": "#9FA39E",
				"pier": "#BDBFB8",
				"bed": "#5E625F",
				"rail": "#8F9391",
				"platform": "#DAD6CC",
				"roof": "#55626A",
				"roofUnder": "#8E979B",
				"post": "#A3A8A6",
				"stair": "#D6D2C8",
				"stairWall": "#C3C5BE",
				"walk": "#D3CFC6",
				"walkWall": "#BFC2BB"
			},
			"dark": {
				"concrete": "#5A6064",
				"under": "#3B4144",
				"pier": "#4E5457",
				"bed": "#2E3335",
				"rail": "#6B7174",
				"platform": "#6C6F6A",
				"roof": "#2F3A40",
				"roofUnder": "#53606A",
				"post": "#5C6366",
				"stair": "#6A6E69",
				"stairWall": "#555B5E",
				"walk": "#676B66",
				"walkWall": "#52585B"
			}
		},
		"night": {
			"glow": "#F0D6A6",
			"underK": .45,
			"platformK": .6,
			"stairK": .5,
			"walkK": .35
		},
		"shadow": {
			"minZoom": 15.5,
			"opacityK": 1.2,
			"maxLengthM": 60
		},
		"lod": {
			"deck": [13.6, 14.2],
			"piers": 15,
			"beds": 16,
			"rails": 16.5,
			"platforms": 15.5,
			"posts": 16.5
		},
		"train": { "laneGapPx": 1.5 },
		"performance": {
			"bytes": 64e6,
			"phoneBytes": 24e6,
			"buildMs": 6,
			"buildMsMoving": 3
		},
		"levels": {
			"stepM": 7,
			"overlapM": 40,
			"crossM": 24,
			"crossAngleDeg": 25,
			"grade": .02,
			"humpGrade": .03,
			"humpPadM": 12,
			"holdM": 2600,
			"marginM": 30
		},
		"exits": {
			"enabled": false,
			"minZoom": 16,
			"stepsZoom": 17.5,
			"maxM": 350,
			"nearGapM": 1,
			"farExtraM": 2,
			"checkStepM": 2.5,
			"clearanceM": 2.5,
			"farZoom": 16,
			"checkZoom": 18,
			"levelPenaltyM": 40,
			"stair": {
				"widthM": 3.2,
				"minPx": 2,
				"riseRun": .8,
				"landingM": 2.4,
				"landingDropM": 5.6,
				"slabM": .45,
				"wallM": 1,
				"wallPx": .8,
				"roofClearM": 2.7,
				"roofM": .25,
				"roofOverhangM": .35,
				"stepRiseM": .3,
				"postM": .25,
				"postPx": 1,
				"footClearM": 12
			},
			"walk": {
				"widthM": 3.2,
				"minPx": 2,
				"slabM": .4,
				"wallM": 1,
				"wallPx": .8,
				"postEveryM": 14,
				"postM": .6,
				"postPx": 1.2,
				"maxAlongM": 60
			}
		},
		"snap": {
			"nearM": 40,
			"maxOffsetM": 40,
			"devMaxM": 40,
			"farRunM": 0,
			"holdM": 40,
			"crossBlocks": true,
			"stationM": 40,
			"blendM": 60,
			"straightM": 6,
			"endTurnDeg": 60,
			"slopeMax": .3,
			"skipEdges": [
				"1호선:8:121",
				"8호선:24:464",
				"2호선:1:10"
			],
			"smoothTubeM": 8,
			"smoothIter": 300,
			"smoothMore": {
				"tubeM": 5,
				"iter": 2e3,
				"edges": [
					"3호선:69:70",
					"경의중앙선:158:159",
					"1호선:199:200",
					"9호선:77:553",
					"6호선:415:416",
					"신분당선:578:579",
					"4호선:99:100",
					"2호선:53:57",
					"6호선:62:403"
				]
			},
			"keepStations": [
				"8호선:24",
				"5호선:133",
				"1호선:2",
				"1호선:3",
				"1호선:4",
				"1호선:5",
				"1호선:6",
				"1호선:7",
				"1호선:8",
				"1호선:9",
				"1호선:104",
				"1호선:115",
				"1호선:116",
				"1호선:121",
				"1호선:126",
				"1호선:127",
				"1호선:199",
				"1호선:200",
				"1호선:228",
				"1호선:229",
				"1호선:255",
				"1호선:275",
				"1호선:276",
				"1호선:346",
				"1호선:347",
				"2호선:6",
				"2호선:10",
				"2호선:12",
				"2호선:13",
				"2호선:14",
				"2호선:15",
				"2호선:17",
				"2호선:23",
				"2호선:24",
				"2호선:25",
				"2호선:26",
				"2호선:27",
				"2호선:29",
				"2호선:31",
				"2호선:36",
				"2호선:37",
				"2호선:39",
				"2호선:42",
				"2호선:43",
				"2호선:45",
				"2호선:48",
				"2호선:50",
				"2호선:51",
				"2호선:53",
				"2호선:54",
				"2호선:55",
				"2호선:57",
				"2호선:58",
				"3호선:3",
				"3호선:154",
				"3호선:31",
				"3호선:59",
				"3호선:61",
				"3호선:62",
				"3호선:67",
				"3호선:68",
				"3호선:70",
				"3호선:71",
				"3호선:73",
				"3호선:74",
				"3호선:75",
				"3호선:77",
				"3호선:78",
				"3호선:86",
				"3호선:88",
				"3호선:350",
				"3호선:351",
				"3호선:352",
				"4호선:258",
				"4호선:259",
				"4호선:5",
				"4호선:34",
				"4호선:205",
				"4호선:206",
				"4호선:208",
				"4호선:209",
				"4호선:211",
				"4호선:213",
				"4호선:90",
				"4호선:93",
				"4호선:95",
				"4호선:99",
				"4호선:103",
				"4호선:104",
				"4호선:105",
				"4호선:110",
				"4호선:111",
				"5호선:3",
				"5호선:389",
				"5호선:13",
				"5호선:652",
				"5호선:51",
				"5호선:396",
				"5호선:359",
				"5호선:363",
				"5호선:370",
				"5호선:371",
				"5호선:379",
				"6호선:14",
				"6호선:401",
				"6호선:404",
				"6호선:413",
				"6호선:157",
				"6호선:158",
				"6호선:161",
				"6호선:421",
				"6호선:422",
				"6호선:426",
				"6호선:420",
				"6호선:46",
				"6호선:179",
				"6호선:106",
				"6호선:124",
				"7호선:20",
				"7호선:533",
				"7호선:286",
				"7호선:424",
				"7호선:41",
				"7호선:429",
				"7호선:431",
				"7호선:432",
				"7호선:434",
				"7호선:435",
				"7호선:436",
				"7호선:437",
				"7호선:440",
				"7호선:441",
				"7호선:446",
				"7호선:447",
				"7호선:450",
				"7호선:453",
				"7호선:456",
				"7호선:457",
				"7호선:77",
				"7호선:333",
				"8호선:295",
				"8호선:181",
				"8호선:471",
				"8호선:474",
				"9호선:536",
				"9호선:537",
				"9호선:543",
				"9호선:549",
				"9호선:550",
				"9호선:551",
				"9호선:553",
				"9호선:555",
				"9호선:45",
				"9호선:558",
				"9호선:561",
				"9호선:563",
				"9호선:565",
				"9호선:115",
				"수인분당선:131",
				"수인분당선:260",
				"수인분당선:16",
				"수인분당선:290",
				"수인분당선:291",
				"수인분당선:302",
				"수인분당선:303",
				"수인분당선:308",
				"수인분당선:311",
				"수인분당선:316",
				"수인분당선:318",
				"수인분당선:326",
				"수인분당선:327",
				"수인분당선:328",
				"수인분당선:86",
				"경의중앙선:152",
				"경의중앙선:153",
				"경의중앙선:156",
				"경의중앙선:160",
				"경의중앙선:47",
				"경의중앙선:114",
				"신분당선:576",
				"신분당선:579",
				"신분당선:574",
				"신분당선:214",
				"신분당선:572",
				"신분당선:573",
				"신분당선:575",
				"공항철도:161",
				"공항철도:567",
				"공항철도:104",
				"공항철도:539",
				"공항철도:568",
				"공항철도:475",
				"공항철도:158",
				"경춘선:180",
				"경춘선:184",
				"경춘선:185",
				"경춘선:188",
				"경춘선:189",
				"서해선:263",
				"서해선:628",
				"서해선:629",
				"서해선:630",
				"서해선:632",
				"서해선:634",
				"서해선:635",
				"서해선:636",
				"GTX-A:647",
				"GTX-A:648",
				"GTX-A:104",
				"GTX-A:304",
				"GTX-A:86",
				"GTX-A:154",
				"경강선:216",
				"경강선:217",
				"경강선:218",
				"경강선:219",
				"경강선:220",
				"경강선:221",
				"인천1호선:658",
				"인천1호선:325",
				"인천1호선:475",
				"인천1호선:477",
				"인천1호선:480",
				"인천1호선:482",
				"인천1호선:483",
				"인천1호선:487",
				"인천1호선:488",
				"인천1호선:495",
				"인천1호선:500",
				"인천2호선:277",
				"인천2호선:509",
				"우이신설선:6",
				"우이신설선:620",
				"우이신설선:623",
				"우이신설선:626",
				"신림선:452",
				"신림선:584",
				"신림선:585",
				"신림선:586",
				"신림선:548",
				"김포골드라인:640",
				"김포골드라인:359",
				"김포골드라인:637"
			]
		},
		"lodExits": {
			"stairs": 16,
			"steps": 17.5
		}
	},
	"styleRevision": "2026-10-03-QA1",
	"changeLog": [{
		"date": "2026-10-03",
		"revision": "QA1",
		"changes": [
			"SC4 reference: nine material families, type mixes, roof mosaics and stable neighbour contrast targets",
			"Daylight neutral tint, broader value range; six office families include masonry",
			"Office emission mask contract and night brightness tiers; renderer binding required for new fields"
		]
	}, {
		"date": "2026-10-03",
		"revision": "QA1+faces",
		"changes": ["facadeFaces (city-build, after the owner's feedback): windows by face (party walls blank, slab ends one column, primary face of small buildings), pier minimums, window-width scales, stone office bays 2.4/2.7 m"]
	}],
	"implementationContract": {
		"status": "data-and-directions-only",
		"existingFields": "Compatible with current resolvePack; reload to rebuild cached geometry and palette.",
		"newFieldsRequireBinding": [
			"materialFamilies",
			"materialAssignment",
			"buildings.*.materialMix",
			"buildings.*.roof.variants",
			"buildings.*.roof.variantWeights",
			"buildings.office.dayReflection",
			"buildings.office.night.windowRatio",
			"buildings.office.night.emission",
			"buildings.office.night.groundFloorEmission",
			"buildings.office.night.brightnessTiers",
			"buildings.office.night.floorProbabilityMultiplier",
			"buildings.office.night.maxContiguousLitBays",
			"buildings.office.night.targetLitFacadeAreaRatio",
			"buildings.office.articulation"
		],
		"priority": [
			"material-family-selection",
			"independent-night-emission-mask",
			"daylight-face-and-reflection",
			"roof-variants",
			"crown-and-corner-detail"
		]
	},
	"materialFamilies": {
		"navyGlass": {
			"label": "먹남색 유리",
			"kind": "glass",
			"wall": {
				"light": [
					"#30475E",
					"#203348",
					"#405B74"
				],
				"dark": [
					"#263847",
					"#1D2B39",
					"#314553"
				]
			},
			"glass": {
				"light": [
					"#243E57",
					"#192E46",
					"#36516C"
				],
				"dark": [
					"#1A2D3D",
					"#162433",
					"#233947"
				]
			},
			"roof": {
				"light": [
					"#566D83",
					"#465E75",
					"#708699"
				],
				"dark": [
					"#354956",
					"#293D4B",
					"#435866"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "curtain-wall",
				"windowRatio": [.82, .8],
				"reflectionScale": .65
			},
			"targetSunlitLStar": [24, 40]
		},
		"silverGlass": {
			"label": "밝은 은색 유리",
			"kind": "glass",
			"wall": {
				"light": [
					"#DCE5E5",
					"#C8D7DD",
					"#EDF0EA"
				],
				"dark": [
					"#55646A",
					"#445A65",
					"#647275"
				]
			},
			"glass": {
				"light": [
					"#B3CCD7",
					"#97B6C9",
					"#C9DDE3"
				],
				"dark": [
					"#344B59",
					"#2B4253",
					"#435E67"
				]
			},
			"roof": {
				"light": [
					"#BBC9D0",
					"#A7BBC7",
					"#CFD8D8"
				],
				"dark": [
					"#4D6069",
					"#3D535E",
					"#5A7075"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "curtain-wall",
				"windowRatio": [.82, .8],
				"reflectionScale": 1
			},
			"targetSunlitLStar": [62, 80]
		},
		"blueGlass": {
			"label": "푸른 반사 유리",
			"kind": "glass",
			"wall": {
				"light": [
					"#81A8C4",
					"#698EAD",
					"#A6C6D8"
				],
				"dark": [
					"#354C61",
					"#2A3F55",
					"#486276"
				]
			},
			"glass": {
				"light": [
					"#668FAE",
					"#507797",
					"#87AFC8"
				],
				"dark": [
					"#243D53",
					"#1C3146",
					"#325067"
				]
			},
			"roof": {
				"light": [
					"#8DA8BB",
					"#728FA6",
					"#A9C0CC"
				],
				"dark": [
					"#3B556A",
					"#30475D",
					"#506A7C"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "curtain-wall",
				"windowRatio": [.82, .8],
				"reflectionScale": .85
			},
			"targetSunlitLStar": [43, 62]
		},
		"ivoryStone": {
			"label": "크림·백색 석재",
			"kind": "stone",
			"wall": {
				"light": [
					"#EEE8D8",
					"#DCDACD",
					"#F6F0E4"
				],
				"dark": [
					"#736C5B",
					"#626153",
					"#837C6A"
				]
			},
			"glass": {
				"light": [
					"#526876",
					"#425A68",
					"#697F87"
				],
				"dark": [
					"#243741",
					"#1C2E38",
					"#334751"
				]
			},
			"roof": {
				"light": [
					"#9CAAB2",
					"#B3BCBF",
					"#7D929F"
				],
				"dark": [
					"#3E505A",
					"#50616A",
					"#31434F"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "regular-grid",
				"windowRatio": [.48, .64],
				"reflectionScale": .12,
				"bayM": 2.4
			},
			"targetSunlitLStar": [72, 88]
		},
		"warmStone": {
			"label": "황갈 석재",
			"kind": "stone",
			"wall": {
				"light": [
					"#C9AD80",
					"#B59064",
					"#DCC59E"
				],
				"dark": [
					"#685740",
					"#56452F",
					"#7C6950"
				]
			},
			"glass": {
				"light": [
					"#56666C",
					"#40535F",
					"#718088"
				],
				"dark": [
					"#25343B",
					"#1E2C35",
					"#354750"
				]
			},
			"roof": {
				"light": [
					"#917F69",
					"#AD9D82",
					"#728896"
				],
				"dark": [
					"#463E35",
					"#585044",
					"#33434D"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "regular-grid",
				"windowRatio": [.52, .62],
				"reflectionScale": .1,
				"bayM": 2.4
			},
			"targetSunlitLStar": [52, 72]
		},
		"redBrick": {
			"label": "적갈 벽돌",
			"kind": "masonry",
			"wall": {
				"light": [
					"#A96550",
					"#8C5144",
					"#C08665"
				],
				"dark": [
					"#523A33",
					"#432F2B",
					"#64483B"
				]
			},
			"glass": {
				"light": [
					"#506877",
					"#3E5565",
					"#6B808A"
				],
				"dark": [
					"#22343F",
					"#1A2B36",
					"#31444D"
				]
			},
			"roof": {
				"light": [
					"#697E8E",
					"#935F4E",
					"#AEB4AD"
				],
				"dark": [
					"#324653",
					"#4C3530",
					"#4C5553"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "punched",
				"windowRatio": [.46, .58],
				"reflectionScale": .06,
				"bayM": 2.7
			},
			"targetSunlitLStar": [37, 56]
		},
		"paintedConcrete": {
			"label": "서울 회백 콘크리트",
			"kind": "concrete",
			"wall": {
				"light": [
					"#DDE2DC",
					"#BFCBD0",
					"#EBE5D5"
				],
				"dark": [
					"#586465",
					"#46575E",
					"#6D6D61"
				]
			},
			"glass": {
				"light": [
					"#637D8C",
					"#4F697C",
					"#7E97A3"
				],
				"dark": [
					"#293F4D",
					"#203440",
					"#3A515A"
				]
			},
			"roof": {
				"light": [
					"#ABB9B9",
					"#7D94A4",
					"#C5CCBF"
				],
				"dark": [
					"#4A5D61",
					"#354D5D",
					"#5B665D"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "type-default",
				"windowRatio": [.56, .6],
				"reflectionScale": .08
			},
			"targetSunlitLStar": [65, 84]
		},
		"plaster": {
			"label": "따뜻한 미장",
			"kind": "plaster",
			"wall": {
				"light": [
					"#E5D4B6",
					"#D1C7AE",
					"#EFE3CC"
				],
				"dark": [
					"#655B47",
					"#585241",
					"#77705B"
				]
			},
			"glass": {
				"light": [
					"#5E7680",
					"#4E626D",
					"#7D8D90"
				],
				"dark": [
					"#293B43",
					"#22313B",
					"#3B4A4D"
				]
			},
			"roof": {
				"light": [
					"#8A9696",
					"#677C8D",
					"#AA775B"
				],
				"dark": [
					"#435354",
					"#304353",
					"#584437"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "type-default",
				"windowRatio": [.42, .48],
				"reflectionScale": .04
			},
			"targetSunlitLStar": [65, 83]
		},
		"galvanizedMetal": {
			"label": "청회색 금속 지붕·패널",
			"kind": "metal",
			"wall": {
				"light": [
					"#B9C9D1",
					"#93A9B8",
					"#D1D8D5"
				],
				"dark": [
					"#4B606A",
					"#3A4E5C",
					"#606C6B"
				]
			},
			"glass": {
				"light": [
					"#667E8A",
					"#526B79",
					"#8199A1"
				],
				"dark": [
					"#2A3E49",
					"#20343F",
					"#3C505A"
				]
			},
			"roof": {
				"light": [
					"#9FB9C9",
					"#7998AF",
					"#C2CFD4"
				],
				"dark": [
					"#456070",
					"#324F63",
					"#5A6D76"
				]
			},
			"variantWeights": [
				.5,
				.3,
				.2
			],
			"facade": {
				"pattern": "type-default",
				"windowRatio": [.68, .24],
				"reflectionScale": .12
			},
			"targetSunlitLStar": [49, 72]
		}
	},
	"materialAssignment": {
		"familySeed": "canonical-building-id-and-world-footprint",
		"variantSeedSalt": 173,
		"roofSeedSalt": 431,
		"retainAcrossThemeModeZoom": true,
		"recolorVisibleBuildingsOnNeighbourArrival": false,
		"facadePolicyByType": {
			"office": "use-family-pattern-and-window-ratio",
			"house": "keep-type-pattern-and-window-ratio",
			"apartment": "keep-type-pattern-and-window-ratio",
			"shop": "keep-type-pattern-and-window-ratio",
			"industrial": "keep-type-pattern-and-window-ratio",
			"civic": "keep-type-pattern-and-window-ratio"
		},
		"roofPriority": [
			"waterproof-subset",
			"type-roof-variants",
			"family-roof",
			"legacy-flat"
		],
		"roofPriorityByType": { "office": [
			"family-roof",
			"type-roof-variants",
			"legacy-flat"
		] },
		"adjacency": {
			"maxFacadeGapM": 55,
			"minHeightM": 24,
			"minAreaM2": 250,
			"maxNeighbors": 4,
			"maxRerolls": 2,
			"targetDeltaLStar": 12,
			"minPassingPairShare": .6,
			"strongDeltaLStar": 22,
			"strongPairShare": .25,
			"maxSameFamilyRun": 3,
			"targetFamilyShareTolerance": .08,
			"minimumSampleBuildings": 50,
			"measurement": "daylight-median-dominant-material-excluding-punched-windows-mullions-highlights-and-cast-shadows",
			"scope": "stable-source-geometry-preprocess",
			"missingNeighbours": "stable-weighted-hash-no-reroll",
			"targetIsSoft": true
		},
		"roofTargets": {
			"lightLStarRange": [40, 75],
			"maxSameToneShareInLowriseBlock": .45
		}
	}
};
export { SEOUL_CITY_STYLE, SEOUL_CITY_STYLE as default };
