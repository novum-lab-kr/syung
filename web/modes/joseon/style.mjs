// web/modes/joseon/style.mjs
var JOSEON_DELTA = {
	id: "joseon",
	label: "한양 / 조선",
	ground: {
		texture: {
			size: 256,
			pixelRatio: 2,
			blotch: .06,
			grain: .03,
			crumbs: 1400,
			pebbles: 26
		},
		light: {
			base: "#C8BDA4",
			residential: "#C5B69A",
			commercial: "#CBBEA3",
			retail: "#CDBFA2",
			industrial: "#C1B59C",
			civic: "#D8CEB8",
			hospital: "#CFC4AC",
			park: "#8E9D73",
			grass: "#A2AE83",
			forest: "#637E59",
			water: "#73969B",
			sidewalk: "#D5C9AF",
			ballast: "#ADA38C"
		},
		dark: {
			base: "#3B3931",
			residential: "#3C3A31",
			commercial: "#3E3B32",
			retail: "#3F3C33",
			industrial: "#393730",
			civic: "#423F35",
			hospital: "#3E3B32",
			park: "#2A3A26",
			grass: "#2F3E28",
			forest: "#21311F",
			water: "#1A3540",
			sidewalk: "#48443A",
			ballast: "#3F3C33"
		}
	},
	roads: {
		classes: {
			motorway: { colors: {
				light: "#DFD2B6",
				dark: "#5C5647"
			} },
			primary: { colors: {
				light: "#DFD2B6",
				dark: "#5C5647"
			} },
			secondary: { colors: {
				light: "#D8C8AB",
				dark: "#554F41"
			} },
			tertiary: { colors: {
				light: "#D1C2A5",
				dark: "#4F4A3D"
			} },
			minor: { colors: {
				light: "#CBB999",
				dark: "#504A3E"
			} },
			service: { colors: {
				light: "#C7B597",
				dark: "#454137"
			} }
		},
		lane: { opacity: {
			light: 0,
			dark: 0
		} },
		centerLine: { opacity: {
			light: 0,
			dark: 0
		} }
	},
	props: {
		lamps: {
			spacingM: 20,
			minorSpacingM: 28,
			heightM: 3.6,
			armM: 0,
			poleDiameterM: .24,
			pole: {
				light: "#5E4532",
				dark: "#3A2A20"
			},
			light: "#FFB15E",
			poolRadiusM: 2.4,
			poolOpacity: .1,
			simcityPoolMaxOpacity: .13,
			torch: {
				basketM: .5,
				basketWidthM: .85,
				flameM: 1.4,
				flameWidthM: .8,
				glowMul: 2.2,
				flame: ["#F06A1E", "#FFD25A"]
			}
		},
		people: {
			clothes: [
				"#EDE9DE",
				"#E2DACA",
				"#55688A",
				"#B59A6E"
			],
			hair: [
				"#141214",
				"#1A1614",
				"#141214",
				"#201A16"
			],
			outfits: [
				{
					shirt: "#9FC3BE",
					lower: "#94B9B4"
				},
				{
					shirt: "#F5F3EE",
					lower: "#56607A"
				},
				{
					shirt: "#5E4B36",
					lower: "#3F3428"
				},
				{
					shirt: "#B9D38B",
					lower: "#2E3C66"
				},
				{
					shirt: "#EBCB6B",
					lower: "#C0453B"
				},
				{
					shirt: "#F1EBDD",
					lower: "#C9567A"
				}
			],
			outfitWeights: [
				3,
				4,
				2,
				3,
				2,
				1
			]
		}
	},
	lighting: { shadow: { color: "#5A4630" } },
	landmarkHide: [{
		lngLat: [126.988216, 37.551259],
		radiusM: 42,
		minH: 0
	}],
	night: {
		lights: {
			street: {
				color: "#FFA65A",
				strength: 1.3,
				heightM: 3
			},
			lampPool: {
				opacity: .36,
				radiusMul: 3.4
			},
			moon: {
				k: .78,
				roofK: .9
			}
		},
		ground: { downtown: {
			colors: [
				"#E8652A",
				"#FF9446",
				"#FFC98A"
			],
			opacity: .2,
			radiusM: 40
		} },
		bloom: { tint: "#FFF2DE" }
	},
	viaduct: {
		aqueduct: { water: {
			light: "#5E93A0",
			dark: "#1D3C48"
		} },
		colors: {
			light: {
				concrete: "#B7AE9C",
				under: "#8E8574",
				pier: "#7E5D41",
				platform: "#9C7A57",
				roof: "#4E585C",
				roofUnder: "#6B4F3A",
				post: "#5E4532",
				stair: "#B1A893",
				stairWall: "#A39A87",
				walk: "#9C7A57",
				walkWall: "#A39A87"
			},
			dark: {
				concrete: "#5C574D",
				under: "#3E3A33",
				pier: "#4A3727",
				platform: "#4E3D2C",
				roof: "#2E3537",
				roofUnder: "#3F2F23",
				post: "#3A2A20",
				stair: "#5A554B",
				stairWall: "#4F4A42",
				walk: "#4E3D2C",
				walkWall: "#4F4A42"
			}
		}
	},
	train: { turtleShip: {
		wood: "#5A3E2B",
		woodDark: "#3B2A1E",
		shell: "#3E4A3B",
		shellEdge: "#263027",
		spike: "#C9C3B0",
		red: "#B23A2A",
		gold: "#D9A43A",
		white: "#F2EBDC",
		ink: "#17120E",
		oar: "#8A6A4A",
		lamp: "#FFC874",
		head: "#8A3324",
		deck: "#B08A5E",
		path: "#A99C7C"
	} },
	modes: { simcity: { shadowOpacity: {
		light: .2,
		dark: .08
	} } },
	hanok: {
		fitK: .94,
		single: {
			maxLengthM: 24,
			maxDepthM: 20
		},
		houseDepthM: [5.5, 7.5],
		houseLengthM: 11,
		maxLengthM: 16,
		yardM: 7.5,
		gapM: 3.5,
		emptyShare: .15,
		maxHouses: 48,
		baseM: .55,
		wallM: [2.5, 3.2],
		eaveOutM: 1.15,
		riseK: .62,
		riseM: [1.4, 4.4],
		hipK: .6,
		cornerLiftM: .6,
		cornerKickM: .3,
		ridge: {
			halfWidthM: .11,
			upM: .18,
			downM: .08
		},
		detail: {
			fasciaM: .16,
			platformOutM: .45,
			stepWidthM: 1.8,
			postM: .22,
			postOutM: .1,
			bracketM: .14,
			bracketOutM: .32,
			hipRidgeM: .14
		},
		roofStyles: {
			narrowHalfM: 2.6,
			narrow: [
				.25,
				.55,
				.2
			],
			wide: [
				.6,
				.12,
				.28
			]
		},
		gableEndM: .6,
		postM: .24,
		bayM: 2.4,
		paperShare: .55,
		plans: {
			giwa: [
				.3,
				.35,
				.22,
				.13
			],
			thatch: [
				.6,
				.4,
				0,
				0
			]
		},
		thatch: {
			byLanduse: {
				residential: .55,
				unknown: .5,
				industrial: .5,
				commercial: .25,
				retail: .3
			},
			districtM: 240,
			maxAreaM2: 420,
			baseM: .3,
			wallM: 2.2,
			eaveOutM: .55,
			riseK: .72,
			riseM: [1.3, 2.5],
			hipK: .95,
			edgeM: .32
		},
		lot: {
			minAreaM2: 95,
			thatchShare: .55,
			giwaShare: .4,
			stoneShareGiwa: .45,
			wallThickM: .55,
			stoneWallM: 1.35,
			yardM: 3.5
		},
		compound: {
			minAreaM2: 260,
			wallM: 1.6,
			wallThickM: .38,
			insetM: .3,
			gateM: 3.2,
			stoneShare: .25,
			gateRoof: {
				widthM: 3.6,
				depthM: 1.1,
				heightM: 2.3
			}
		},
		tall: {
			towerMinH: 15,
			storeyM: 3.2,
			skirtStep: [
				[9, 1],
				[20, 2],
				[999, 3]
			],
			skirtRiseM: 1,
			skirtEdgeM: .12,
			skirtGroup: {
				widthM: 9,
				gapM: 2.2,
				minM: 4.5,
				outM: 1.5,
				flareM: .35,
				cornerK: .24,
				cornerM: [4, 7.5],
				cornerOutM: 1.9,
				rows: [
					0,
					.55,
					1
				],
				upK: .15,
				liftM: [.75, .4]
			},
			podiumM: 4.2,
			podiumOutM: 1.6,
			triRoofAspect: 2.1,
			towerMaxHalfM: [22, 14],
			pagodaMinH: 100,
			pagodaMaxAspect: 1.6,
			pagodaShare: .85,
			pagodaStoreyMinM: 7,
			pagodaShrink: .07,
			pagodaEaveM: 1.6,
			spireM: 9,
			hallMinH: 8,
			hallMinAreaM2: 150,
			hallShare: .5,
			hallShareResidential: .12,
			hallStoreyM: [3.4, 3],
			hallSetM: 1.4,
			hallHalfM: [14, 8]
		},
		colors: {
			light: {
				giwa: [
					"#484C4B",
					"#3F4342",
					"#535857"
				],
				wood: "#7B513A",
				plaster: "#DED1B6",
				paper: "#F3EBD3",
				stone: "#A5A397",
				dam: "#D8CDB5",
				soffit: "#302B24",
				ridge: "#3E4241",
				glass: "#718887",
				thatch: [
					"#A88D55",
					"#9C8350",
					"#B39A62"
				],
				mud: "#C4AA83",
				field: ["#9C978B", "#857F74"],
				spire: "#C99B3A"
			},
			dark: {
				giwa: [
					"#424645",
					"#3A3D3C",
					"#4B4F4E"
				],
				wood: "#5A3824",
				plaster: "#8E877A",
				paper: "#9C927A",
				stone: "#6F6A60",
				dam: "#80776A",
				soffit: "#1F1B17",
				ridge: "#2A2D2C",
				glass: "#34403F",
				thatch: [
					"#6E5B39",
					"#625233",
					"#5A4D37"
				],
				mud: "#6B5C46",
				field: ["#5B5851", "#4D4A44"],
				spire: "#7A6024"
			}
		},
		night: {
			paper: "#EBC58A",
			litShare: .24,
			emission: .45
		}
	}
};
export { JOSEON_DELTA, JOSEON_DELTA as default };
