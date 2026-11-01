// 기념물 전용 모델(web/city/monuments.mts)의 자리와, 그 자리 지도 건물을 빼는 목록. 데이터만 둔다.
//
// 광화문: 자리는 지도(OSM way 170199440 · building=gatehouse)의 외곽에서 잰다. 가운데 동서 -5.5 m · 남북 -0.1 m(기준 126.97688 · 37.57593),
// 중앙 육축 앞면 31 m(동서 -21.3 ~ 9.7 m) · 깊이 13.3 m, 앞면이 동쪽으로 갈수록 1.3° 남쪽으로 기운다(시계 방향 · 아래 yawDeg).
// zone: 이 기념물 모델이 든 구역 파일(monuments_<zone>.mts — 구역마다 따로 지연 로드한다)
// 모델 · 담장 · 궁 안 건물 · 나무 · 횃불이 보이는 줌 · 자라기 · 폰의 먼 곳 줄이기는 도시 건물과 같은 공용 셈(zoom_gate.mts)을 쓴다 —
// 원래 건물을 숨기는 목록(MONUMENT_HIDES)은 줌과 상관없이 늘 적용되니 같은 줌에서 함께 나타나고 사라져 비거나 겹치는 구간이 없다
export interface Monument { id:string; zone:string; lngLat:[number, number]; yawDeg:number; openingsOnly?:boolean }
export const GATE_DECK_Z = 1.1, GATE_BASE_D = 13.3;   // 광화문 월대 윗면 높이(맞춤) · 육축 깊이(지도 외곽)
// 경복궁 모델의 기준점(지도 좌표) · 둘레와 건물 자리의 정수 좌표 원점
export const PALACE_AT:[number, number] = [126.977, 37.579];
export const PALACE_ORIGIN:[number, number] = [126.97, 37.57];
// 경복궁 둘레: OSM relation 5501517(경복궁)의 바깥 경계(좌표는 원점 기준 정수 짝 — monuments_gyeongbok_data.mts 머리 주석). 담장 모델과 지도 건물 비우기가 같이 쓴다
export const PALACE_RING:number[] = [4036,8690,4073,8376,4111,8054,4234,7300,4301,6962,4387,6427,4445,6097,4446,6088,4592,6006,4698,6005,4742,6004,5139,5984,5448,5972,6197,5941,6640,5931,6639,5880,6638,5872,6733,5870,6829,5869,6927,5866,6990,5865,6990,5871,6991,5908,7019,5907,7935,5925,8173,5930,8339,5940,8601,5976,8861,6008,9126,6295,9318,6458,9317,6507,9316,6564,9296,6563,9296,6580,9266,6579,9269,6753,9295,6753,9295,6770,9328,6771,9354,7936,9348,8071,9357,8200,9411,9013,9425,9497,9329,9500,9327,9566,9325,9620,9325,9631,9323,9686,9443,9692,9462,9986,9689,9980,10017,11036,10049,12170,9968,12615,9780,12941,9298,13289,7413,13565,6716,13667,6446,13651,6127,13632,5609,13552,5432,13523,4511,13350,4119,13277,3945,13226,3936,13000,3755,12912,3755,12743,3786,11975,3822,11071,3834,10761,3910,9816,4015,8900,4022,8830,3998,8829,4007,8801,4013,8778,4014,8758,4015,8738,4015,8714,4013,8686,4036,8690];
const ringOf = (flat:number[], origin:[number, number]):[number, number][] => { const ring:[number, number][] = []; for (let i = 0; i < flat.length; i += 2) ring.push([origin[0] + flat[i]! / 1e6, origin[1] + flat[i + 1]! / 1e6]); return ring };
export const palaceRing = ():[number, number][] => ringOf(PALACE_RING, PALACE_ORIGIN);
// 창덕궁 모델의 기준점 · 정수 좌표 원점 · 둘레: OSM way 789965985(창덕궁 · heritage=1)의 경계 — 좌표는 원점 기준 정수 짝. 둘레만 여기(첫 화면 쪽)에 두고 건물 · 나무 자료는 구역 파일(지연 로드)에 있다
export const CDG_AT:[number, number] = [126.991, 37.5825];
export const CDG_ORIGIN:[number, number] = [126.98, 37.57];
export const CDG_RING:number[] = [9819,12212,9546,11709,9526,11282,9513,10906,9391,10908,9356,8960,9428,8725,9447,8664,9555,8330,9712,7801,9821,7819,9836,7765,9912,7778,10063,7803,10162,7820,10144,7889,10313,7920,10673,7588,10932,7630,11220,7844,12127,8501,12586,7772,12698,7647,12744,7597,12891,7578,13030,7705,13060,7722,13157,7807,13431,7773,13658,7807,13724,7945,13931,7885,13992,8021,14046,8142,14212,8509,14103,8539,14112,8593,14094,8808,13880,8803,13908,8855,13832,8976,13717,9009,13714,9048,13509,9213,13469,9202,13174,9397,13188,9426,13149,9506,13030,9530,13032,9539,13101,9786,13180,9858,13556,10633,13775,10871,13746,11248,14038,11792,13507,12563,13395,13304,13713,13647,13909,13876,14056,14236,14137,14509,14096,14755,14538,14899,14447,15051,13936,15665,13247,16884,12728,17067,12367,17144,11786,16997,11187,16957,11074,16868,10892,16835,10759,16777,10522,16794,10079,16935,9791,16924,9784,17029,9610,17025,9509,17196,9475,17383,9305,17536,9085,17438,8715,17519,8474,17454,8373,17331,7815,17006,7941,16602,7902,16098,8050,15534,7907,15526,7677,15208,7577,15177,7586,14893,7331,14819,7328,14750,7716,13863,8237,13710,8757,13851,8882,13886,8913,13896,9037,13985,9056,14031,9144,14068,9424,13669,9459,12908,9715,12624,9819,12212];
export const cdgRing = ():[number, number][] => ringOf(CDG_RING, CDG_ORIGIN);
// 덕수궁 모델의 기준점 · 정수 좌표 원점 · 둘레: OSM way 26658458(덕수궁 담장)의 경계. 중명전은 담장 밖이라 둘레가 따로(JMJ_RING: OSM way 646147127 외곽)
export const DSG_AT:[number, number] = [126.9749, 37.5659];
export const DSG_ORIGIN:[number, number] = [126.96, 37.55];
export const DSG_RING:number[] = [13716,15214,13748,15175,13774,15086,13902,14918,13905,14914,13959,14844,13995,14823,14070,14812,14596,14844,15621,14959,15826,14968,15969,14959,16118,14941,16545,14895,16558,14945,16593,14939,16610,15015,16634,15104,16599,15110,16600,15119,16699,15104,16824,15506,16803,16537,16331,16535,15845,16532,15529,16577,15496,16583,15487,16585,15201,16636,14845,16746,14764,16772,14644,16898,14611,16935,14453,16940,14264,16946,14141,17194,14039,17345,13888,17455,13357,17456,13284,17416,13509,16687,13546,16529,13542,16437,13518,15897,13526,15598,13522,15375,13534,15350,13563,15318,13639,15266,13716,15214];
export const dsgRing = ():[number, number][] => ringOf(DSG_RING, DSG_ORIGIN);
export const JMJ_RING:number[] = [12419,16627,12511,16625,12535,16624,12559,16623,12652,16621,12680,16621,12690,16831,12496,16840,12494,16797,12428,16799];
export const jmjRing = ():[number, number][] => ringOf(JMJ_RING, DSG_ORIGIN);
// 창경궁 모델의 기준점 · 정수 좌표 원점 · 둘레: OSM way 380863257(창경궁)의 경계
export const CGG_AT:[number, number] = [126.9947, 37.5804];
export const CGG_ORIGIN:[number, number] = [126.98, 37.56];
export const CGG_RING:number[] = [13431,17773,13157,17807,13060,17722,13174,17699,13500,17578,13786,17463,15903,16538,16357,16340,16810,16463,17006,17027,16777,17769,16798,17772,16776,17864,16746,17860,16572,18485,16566,18545,16484,19261,16205,20739,16119,21191,16226,21255,16454,21384,16493,21406,16563,21460,16526,21576,16424,22434,16017,23231,15979,23350,15874,23509,15706,23678,15515,23858,15233,24111,15273,24138,15234,24175,15193,24148,14820,24513,14616,24768,14538,24899,14096,24755,14137,24509,14056,24236,13909,23876,13713,23647,13395,23304,13507,22563,14038,21791,13746,21248,13775,20871,13556,20633,13180,19858,13101,19786,13032,19539,13030,19530,13149,19506,13188,19426,13174,19397,13469,19202,13509,19213,13714,19047,13717,19009,13832,18976,13908,18855,13880,18803,14094,18808,14112,18593,14103,18539,14212,18509,14046,18142,13992,18021,13931,17885,13724,17945,13658,17807,13431,17773];
export const cggRing = ():[number, number][] => ringOf(CGG_RING, CGG_ORIGIN);
export const GHG_AT:[number, number] = [126.968, 37.5714];
export const GHG_ORIGIN:[number, number] = [126.95, 37.56];
// 경희궁은 터 둘레(OSM 에 없음)를 쓰지 않고, 숭정전 일곽 건물 일곱 채 윤곽(OSM way 196072046 · 49 · 52 · 55 · 555488600 · 614 …)을 감싸는 작은 사각이다 — 근처 일반 건물(서울기상관측소 · 교육청 …)이 숨김에 안 걸리게.
export const GHG_RING:number[] = [17000,10700,19000,10700,19000,12000,17000,12000,17000,10700];
export const ghgRing = ():[number, number][] => ringOf(GHG_RING, GHG_ORIGIN);
// 흥화문(OSM way 196071778)만 따로 숨기는 작은 사각 — 둘레 밖(약 250 m 남동)이라 둘레 하나로 묶으면 사이 건물까지 숨는다
export const HHM_RING:number[] = [19300,9380,19900,9380,19900,9670,19300,9670,19300,9380];
export const hhmRing = ():[number, number][] => ringOf(HHM_RING, GHG_ORIGIN);
export const UHG_AT:[number, number] = [126.9873, 37.576];
export const UHG_ORIGIN:[number, number] = [126.97, 37.56];
export const UHG_RING:number[] = [16509,16421,16810,15587,17122,15656,17168,15508,17205,15501,17248,15510,17631,15606,17661,15623,17688,15645,17712,15683,17725,15750,17718,15798,17652,16012,17542,16403,17509,16564,17327,16577,17208,16865,16938,16808,16813,16779,16911,16522,16509,16421];
export const uhgRing = ():[number, number][] => ringOf(UHG_RING, UHG_ORIGIN);
// 운현궁은 둘레 전체를 숨기지 않는다 — 윤곽을 알고 전용 모델로 바꾼 건물만 숨긴다.
// 그래서 전용 모델로 짓는 OSM 건물 열한 채(수직사 · 김승현 가옥 · 유물전시관 · 양관 · 노안당 · 노락당 일곽 · 이로당 · 윤곽만 있는 한옥 …)의 자기 윤곽만 숨긴다(UHG_ORIGIN 기준 정수 짝, 마지막 점 = 첫 점).
export const UHG_HIDE_RINGS:number[][] = [
  [17294,16050,17312,15993,17215,15972,17194,16029,17294,16050],  // OSM 414771658 
  [16677,16415,16717,16298,16811,16319,16796,16362,16915,16388,16890,16461,16677,16415],  // OSM 414771659 유물전시관
  [17588,16248,17644,16043,17760,16063,17773,16018,17846,16030,17832,16081,17903,16093,17848,16293,17588,16248],  // OSM 414771660 운현궁 양관
  [16781,15709,16812,15622,17176,15702,17146,15788,16851,15725,16781,15709],  // OSM 634120499 수직사
  [16901,16660,16935,16567,16999,16581,16982,16630,17083,16653,17102,16602,17183,16620,17148,16716,16901,16660],  // OSM 634120501 김승현 가옥
  [16891,16762,16909,16709,17134,16756,17116,16809,16891,16762],  // OSM 634120502 
  [16781,15709,16775,15708,16690,15938,16566,16274,16642,16292,16767,15954,16851,15725,16781,15709],  // OSM 709490447 
  [16794,15930,16803,15902,16832,15908,16823,15936,16794,15930],  // OSM 709490449 
  [16846,16296,16733,16274,16735,16267,16753,16271,16756,16262,16715,16254,16740,16171,16892,16200,16867,16283,16824,16275,16821,16284,16848,16289,16846,16296],  // OSM 768422581 
  [17225,16347,17045,16305,16968,16516,17225,16575,17292,16391,17225,16347],  // OSM 414771657 이로당
  [17264,16385,17302,16279,17449,16313,17618,15843,17288,15769,17257,15858,17300,15867,17327,15791,17376,15802,17339,15905,17457,15932,17449,15956,17112,15881,17091,15943,17215,15972,17312,15993,17456,16028,17435,16084,17294,16050,17194,16029,17148,16152,17363,16202,17347,16244,17104,16188,17079,16258,17244,16296,17264,16385],  // OSM 634120500 노안당 · 노락당 일곽
];
export const uhgHideRings = ():[number, number][][] => UHG_HIDE_RINGS.map(ring => ringOf(ring, UHG_ORIGIN));
// 종묘 · 사직단 · 환구단 모델의 기준점 · 정수 좌표 원점 · 둘레. 기준점 = 둘레 중심(환구단은 OSM node 환구단). 둘레: 종묘 = 바깥 담(OSM 담 way 이은 경계) · 환구단 = OSM way 767869618(공원 경계) ·
// 사직단 = 근사(OSM 문 node · 산울타리 선에서 읽은 사각형 — 정확한 담 선 자료는 지도에 없다). 건물 · 나무 자료는 구역 파일(지연 로드)에 있다
export const JM_AT:[number, number] = [126.99443, 37.57437];
export const JM_ORIGIN:[number, number] = [126.98, 37.57];
export const JM_RING:number[] = [14790,6859,14824,6858,14953,6854,15113,6827,15260,6774,15385,6712,15433,6661,15529,6385,15570,6289,15779,5772,15748,5502,15805,5186,16119,4719,16532,3389,16701,2877,16665,2685,16458,2388,16313,2246,16221,2196,16107,2138,15937,2079,15735,2035,15583,2012,15507,2010,15403,2036,15211,2093,15029,2137,14931,2150,14827,2143,14706,2117,14718,2076,14621,2057,14556,2045,14546,2079,14447,2061,14349,2048,14159,2052,14006,2067,13899,2102,13784,2182,13684,2296,13502,2519,13009,3158,12712,3600,12453,4063,12014,4585,11615,5256,11445,5749,11445,5845,11448,5963,11652,6537,11741,6675,12397,7301,12768,7519,12945,7335,13095,7235,13368,7124,13583,7039,14108,6898,14420,6861,14706,6862,14757,6861,14790,6859,14790,6859];
export const jmRing = ():[number, number][] => ringOf(JM_RING, JM_ORIGIN);
export const SJ_AT:[number, number] = [126.9677, 37.5756];
export const SJ_ORIGIN:[number, number] = [126.96, 37.57];
export const SJ_RING:number[] = [7110,5488,7828,5192,8257,5845,7539,6142,7110,5488];
export const sjRing = ():[number, number][] => ringOf(SJ_RING, SJ_ORIGIN);
export const HG_AT:[number, number] = [126.97968, 37.56501];
export const HG_ORIGIN:[number, number] = [126.97, 37.56];
export const HG_RING:number[] = [8889,5245,8879,5227,8987,5187,8911,5021,8834,5045,8800,5056,8793,5040,8825,5029,9091,4948,9131,4936,9049,4733,9425,4655,9487,4641,9523,4641,9576,4642,9635,4647,9686,4664,10376,4894,10334,4960,10133,4903,10096,4980,10050,5050,9970,5119,9914,5151,9879,5153,9884,5212,9886,5243,9696,5224,9662,5319,9640,5361,9586,5344,9540,5327,9502,5310,9463,5291,9432,5272,9397,5249,9378,5232,9365,5221,9349,5207,9323,5187,9300,5166,9276,5145,9252,5121,9241,5108,8978,5210,8909,5237,8889,5245];
export const hgRing = ():[number, number][] => ringOf(HG_RING, HG_ORIGIN);
// 왕릉(선릉 · 정릉(중종) · 정릉(신덕왕후) · 의릉 · 헌인릉 · 태릉 · 강릉) · 석촌동 고분군 · 풍납토성 · 몽촌토성 움집터: 구역마다 기준점(AT) · 정수 좌표 원점(ORIGIN) · 숨김 둘레(RINGS — 지도 건물을 비우고 도시 나무가 비킨다).
// 둘레는 OSM 공원 · 담 윤곽이 있으면 그것, 없으면 건물 · 봉분 윤곽을 감싼 바깥 18 m 넓힌 볼록 껍질(근사). 풍납토성은 남은 성벽 선을 양쪽 17 m(모델 밑 반폭)씩 띠로 감싼 것. 건물 · 봉분 · 나무 자료는 구역 파일(지연 로드)에 있다. (© OpenStreetMap contributors, ODbL)
export const SJN_AT:[number, number] = [127.04932, 37.50845];
export const SJN_ORIGIN:[number, number] = [127.04, 37.5];
export const SJN_RINGS:number[][] = [
  [5271,8223,5388,8150,5540,8056,5590,8124,5939,8181,6185,8222,6240,8198,6238,8153,6248,8081,6210,8023,6177,7985,6210,7933,6248,7915,6316,7901,6391,7865,6447,7823,6583,7476,6598,7412,7007,7163,7271,7139,6967,7344,6972,7301,6960,7275,6921,7287,6867,7312,6807,7349,6780,7378,6786,7400,6749,7484,6697,7551,6658,7635,6626,7744,6621,7826,6639,7922,6687,8011,6774,8016,6822,8052,6819,8087,6792,8135,6744,8170,6705,8210,6675,8286,6634,8354,6539,8447,6442,8481,6408,8495,6205,8560,6118,8608,6064,8649,5998,8651,5909,8642,5877,8659,5827,8648,5795,8641,5729,8627,5709,8677,5727,8682,5654,8880,5579,8898,5425,8862,5382,8813,5447,8621,5417,8609,5356,8597,5253,8559,5263,8503,5383,8455,5393,8399,5368,8292,5271,8223],
  [6751,8651,6858,8665,6882,8558,6775,8543,6751,8651],
  [11375,8946,11392,9023,11435,9092,11500,9147,12501,9579,12736,9474,12987,9291,13113,9179,13266,8940,13354,8629,12787,8150,12723,8106,12629,8126,12029,8300,11916,8352,11422,8801,11385,8870,11375,8946],
  [9057,7088,9081,7282,9855,7224,9847,7095,9717,7039,9057,7088],
  [6802,9552,7116,9925,7314,9939,7598,9747,7611,9589,7196,9285,6802,9552],
];
export const sjnRings = ():[number, number][][] => SJN_RINGS.map(ring => ringOf(ring, SJN_ORIGIN));
export const JNG_AT:[number, number] = [127.00598, 37.60221];
export const JNG_ORIGIN:[number, number] = [127, 37.6];
export const JNG_RINGS:number[][] = [
  [5310,2122,5314,2195,5447,2278,6482,2411,6620,2371,6648,2290,6555,2198,6468,2164,5399,2017,5352,2054,5310,2122],
];
export const jngRings = ():[number, number][][] => JNG_RINGS.map(ring => ringOf(ring, JNG_ORIGIN));
export const UIR_AT:[number, number] = [127.05721, 37.60402];
export const UIR_ORIGIN:[number, number] = [127.05, 37.6];
export const UIR_RINGS:number[][] = [
  [8518,4144,8376,4244,8062,4295,7692,4242,7266,4208,7077,4134,6955,3995,6786,3816,6601,3679,6364,3590,6222,3513,6874,3131,7636,3532,8158,3781,8221,3811,8448,3978,8518,4144],
  [7663,4551,7697,4678,7866,4649,7832,4523,7663,4551],
];
export const uirRings = ():[number, number][][] => UIR_RINGS.map(ring => ringOf(ring, UIR_ORIGIN));
export const HIN_AT:[number, number] = [127.08132, 37.46503];
export const HIN_ORIGIN:[number, number] = [127.07, 37.46];
export const HIN_RINGS:number[][] = [
  [9856,6474,9913,5626,10370,5113,10776,4383,11239,4542,13685,4569,14291,4822,13223,6798,9856,6474],
  [12168,4418,12528,4425,12536,4310,12168,4304,12168,4418],
  [12321,3881,12326,3961,13153,4043,13191,3872,13056,3794,12863,3764,12739,3758,12499,3798,12378,3845,12321,3881],
  [12548,4417,13515,4431,13521,4162,12555,4148,12548,4417],
  [10013,4121,10019,4146,10031,4171,10116,4296,10171,4350,10200,4352,10233,4349,10263,4342,10289,4331,10309,4318,10327,4304,10344,4282,10354,4257,10360,4234,10361,4214,10359,4196,10350,4176,10338,4154,10206,3981,10173,3982,10145,3986,10109,3993,10085,4001,10062,4014,10035,4043,10021,4083,10013,4121],
  [8940,5689,9191,5688,9194,5488,8943,5484,8933,5580,8940,5689],
  [9547,5263,9614,5300,9709,5191,9642,5154,9547,5263],
];
export const hinRings = ():[number, number][][] => HIN_RINGS.map(ring => ringOf(ring, HIN_ORIGIN));
export const TGN_AT:[number, number] = [127.10116, 37.63684];
export const TGN_ORIGIN:[number, number] = [127.09, 37.63];
export const TGN_RINGS:number[][] = [
  [6614,4834,6651,4863,6852,4928,6939,4912,7041,4729,7406,3420,7409,3347,7285,3320,7233,3374,6614,4834],
  [14996,10248,15216,10298,15409,10293,15889,9765,16049,9471,16069,9313,15645,9147,15254,9340,15097,9554,14905,9817,14932,10149,14996,10248],
];
export const tgnRings = ():[number, number][][] => TGN_RINGS.map(ring => ringOf(ring, TGN_ORIGIN));
export const SKC_AT:[number, number] = [127.10218, 37.50318];
export const SKC_ORIGIN:[number, number] = [127.1, 37.5];
export const SKC_RINGS:number[][] = [
  [1794,4161,2527,4173,2615,3690,2496,2340,2394,2191,2156,2243,1884,2737,1722,3669,1794,4161],
];
export const skcRings = ():[number, number][][] => SKC_RINGS.map(ring => ringOf(ring, SKC_ORIGIN));
export const PNP_AT:[number, number] = [127.11618, 37.53417];
export const PNP_ORIGIN:[number, number] = [127.11, 37.52];
export const PNP_RINGS:number[][] = [
  [8350,12278,8148,12079,7922,11791,7746,11617,7312,11277,6842,10939,6366,10640,6069,10450,5895,10305,5731,10200,5611,10133,5505,10067,5365,9969,5202,9772,5525,9606,5664,9777,5749,9830,5842,9888,5965,9958,6158,10081,6326,10223,6606,10401,7091,10706,7577,11055,8027,11408,8239,11617,8464,11905,8649,12085,8350,12278],
  [9693,15038,9183,13840,9548,13742,10058,14940,9693,15038],
  [5065,9619,4783,9332,4538,9190,4365,9051,3846,8634,3416,8282,3145,7988,3294,8024,3072,8120,2730,8228,1755,8570,1318,8663,1287,8688,1248,8765,1221,8856,1209,8963,1247,9052,1288,9133,1311,9346,1464,10228,1082,10269,929,9385,907,9183,884,9153,826,8994,840,8813,883,8666,978,8506,1179,8378,1615,8285,2577,7948,2912,7842,3149,7741,3431,7784,3708,8082,4121,8420,4640,8836,4787,8957,5059,9118,5369,9431,5065,9619],
  [8844,20343,9237,20107,10025,19577,10274,19810,9481,20343,9077,20586,8844,20343],
  [8995,13532,8823,13021,8688,12725,8511,12454,8854,12314,9042,12604,9192,12933,9367,13453,8995,13532],
  [10293,19388,11037,18864,11110,18782,11144,18603,11140,18372,11089,18126,10945,17865,10802,17653,10710,17521,11047,17373,11141,17508,11293,17733,11458,18038,11524,18343,11528,18624,11472,18886,11305,19083,10549,19617,10293,19388],
];
export const pnpRings = ():[number, number][][] => PNP_RINGS.map(ring => ringOf(ring, PNP_ORIGIN));
export const MCN_AT:[number, number] = [127.12451, 37.52037];
export const MCN_ORIGIN:[number, number] = [127.12, 37.52];
export const MCN_RINGS:number[][] = [
  [4552,512,4422,523,4329,490,4290,427,4312,364,4389,314,4373,244,4515,208,4548,276,4637,278,4702,317,4730,364,4714,424,4662,473,4552,512],
];
export const mcnRings = ():[number, number][][] => MCN_RINGS.map(ring => ringOf(ring, MCN_ORIGIN));
export const tombRings = ():[number, number][][] => [...sjnRings(), ...jngRings(), ...uirRings(), ...hinRings(), ...tgnRings(), ...skcRings(), ...pnpRings(), ...mcnRings()];
// 근현대 문화유산 여섯 곳(탑골공원 · 명동성당 · 문화역서울 284 · 서대문형무소 · 조계사 · 봉은사): 기준점 · 정수 좌표 원점 · 둘레(OSM 건물 · 담 · 경계에서 — © OpenStreetMap contributors). 건물 · 나무 자료는 구역 파일(지연 로드)에 있다
export const WG_AT:[number, number] = [126.98835, 37.5715];
export const WG_ORIGIN:[number, number] = [126.98, 37.57];
export const WG_RING:number[] = [7855,603,7862,517,8305,460,8510,436,8594,444,8702,455,8716,990,8679,1095,8238,1673,8068,1620,7855,603];
export const wgRing = ():[number, number][] => ringOf(WG_RING, WG_ORIGIN);
export const MD_AT:[number, number] = [126.9874, 37.5634];
export const MD_ORIGIN:[number, number] = [126.98, 37.56];
export const MD_RING:number[] = [5883,3929,5940,3782,5865,3754,5829,3591,5857,3472,6060,3039,5942,2975,6019,2733,6167,2573,5951,2452,5970,2355,6194,2426,6255,2141,6717,2219,6796,1967,8007,2084,8695,2210,8593,2583,8548,2744,8413,2996,8151,3399,7820,3279,7754,3432,7740,3652,7709,3790,7731,3903,7766,3941,7435,4572,7075,4545,6434,4186,6157,4076,5883,3929];
export const mdRing = ():[number, number][] => ringOf(MD_RING, MD_ORIGIN);
export const S2_AT:[number, number] = [126.97161, 37.55599];
export const S2_ORIGIN:[number, number] = [126.97, 37.55];
export const S2_RING:number[] = [1412,6211,1428,5340,1629,5339,1737,5399,1798,5775,1801,5977,1657,6507,1606,6641,1412,6638,1412,6211];
export const s2Ring = ():[number, number][] => ringOf(S2_RING, S2_ORIGIN);
export const SD_AT:[number, number] = [126.9558, 37.5742];
export const SD_ORIGIN:[number, number] = [126.95, 37.57];
export const SD_RING:number[] = [4836,4498,5882,3367,6052,3188,6230,3300,7027,3855,7166,4747,5928,5188,5469,5020,5383,4960,5056,4695,4836,4498];
export const sdRing = ():[number, number][] => ringOf(SD_RING, SD_ORIGIN);
export const JG_AT:[number, number] = [126.98215, 37.5741];
export const JG_ORIGIN:[number, number] = [126.98, 37.57];
export const JG_RING:number[] = [1416,4065,1773,4831,1957,4788,2067,4951,2207,4914,2184,4834,2299,4801,2239,4623,2243,4534,2399,4531,2373,4198,2370,4089,2385,3964,2462,3981,2763,3990,2770,3746,2665,3724,2670,3680,2215,3622,2219,3521,2122,3520,2120,3400,1651,3442,1655,3477,1289,3529,1416,4065];
export const jgRing = ():[number, number][] => ringOf(JG_RING, JG_ORIGIN);
export const BE_AT:[number, number] = [127.0575, 37.5148];
export const BE_ORIGIN:[number, number] = [127.05, 37.51];
export const BE_RING:number[] = [5056,5380,5069,4885,5574,4882,5691,4611,5906,4644,5993,4654,6169,4629,6287,4544,6362,4395,6515,3788,6534,3714,8336,4005,8253,4375,8358,4528,8517,4781,8539,5625,8938,5773,8377,6630,7056,6274,6665,6227,6260,6112,5806,5919,5404,5675,5056,5380];
export const beRing = ():[number, number][] => ringOf(BE_RING, BE_ORIGIN);
// 두 도성문 중심 · 방향: OSM 원자료의 육축 긴 변(2026-11-01), 구역 파일 머리에 계산 근거.
// 숭례문 https://www.openstreetmap.org/relation/10647050 · 흥인지문 https://www.openstreetmap.org/way/320783808
export const MONUMENTS:Monument[] = [
  { id: 'sungnyemun', zone: 'sungnyemun', lngLat: [126.97536025, 37.559986249999994], yawDeg: -41.8017044508303, openingsOnly: true },
  { id: 'heunginjimun', zone: 'heunginjimun', lngLat: [127.009594975, 37.571153975], yawDeg: 100.09911107449813, openingsOnly: true },
  { id: 'gwanghwamun', zone: 'gyeongbok', lngLat: [126.976817, 37.575928], yawDeg: -1.3 },
  // 광화문광장 동상(곡면 메시 — monuments_statues.mts): 자리 · 방향은 OSM node(이순신 2653074012 · 세종대왕 3841809527, direction 180° = 남쪽을 본다)
  { id: 'yi-sunsin', zone: 'gyeongbok', lngLat: [126.97695, 37.57097], yawDeg: 0 },
  { id: 'sejong', zone: 'gyeongbok', lngLat: [126.97691, 37.57292], yawDeg: 0 },
  // 경복궁 둘레 담장 · 궁 안 건물(흥례문 … 향원정 전용 모델 + 나머지 한옥 틀): 같은 기준점 PALACE_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'palace-wall', zone: 'gyeongbok', lngLat: PALACE_AT, yawDeg: 0 },
  { id: 'palace-halls', zone: 'gyeongbok', lngLat: PALACE_AT, yawDeg: 0 },
  { id: 'palace-frames', zone: 'gyeongbok', lngLat: PALACE_AT, yawDeg: 0 },
  // 창덕궁(둘레 담장 · 돈화문 · 인정전 일곽 · 선정전 · 희정당 · 대조전 · 낙선재 · 후원 정자 · 나머지 한옥 틀): 기준점 CDG_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'cdg-wall', zone: 'changdeokgung', lngLat: CDG_AT, yawDeg: 0 },
  { id: 'cdg-halls', zone: 'changdeokgung', lngLat: CDG_AT, yawDeg: 0 },
  { id: 'cdg-frames', zone: 'changdeokgung', lngLat: CDG_AT, yawDeg: 0 },
  // 덕수궁(둘레 담장 · 대한문 · 중화전 일곽 · 함녕전 일곽 · 석조전 · 정관헌 · 돈덕전 · 중명전 · 나머지 한옥 틀): 기준점 DSG_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'dsg-wall', zone: 'deoksugung', lngLat: DSG_AT, yawDeg: 0 },
  { id: 'dsg-halls', zone: 'deoksugung', lngLat: DSG_AT, yawDeg: 0 },
  { id: 'dsg-frames', zone: 'deoksugung', lngLat: DSG_AT, yawDeg: 0 },
  // 창경궁(둘레 담장 · 홍화문 · 명정전 일곽 · 통명전 · 환경전 · 대온실 · 나머지 한옥 틀): 기준점 CGG_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'cgg-wall', zone: 'changgyeonggung', lngLat: CGG_AT, yawDeg: 0 },
  { id: 'cgg-halls', zone: 'changgyeonggung', lngLat: CGG_AT, yawDeg: 0 },
  { id: 'cgg-frames', zone: 'changgyeonggung', lngLat: CGG_AT, yawDeg: 0 },
  // 경희궁(숭정전 일곽 · 흥화문): 기준점 GHG_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'ghg-halls', zone: 'gyeonghuigung', lngLat: GHG_AT, yawDeg: 0 },
  { id: 'ghg-frames', zone: 'gyeonghuigung', lngLat: GHG_AT, yawDeg: 0 },
  // 운현궁(민가식 건물 · 유물전시관 · 양관): 기준점 UHG_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'uhg-halls', zone: 'unhyeongung', lngLat: UHG_AT, yawDeg: 0 },
  { id: 'uhg-frames', zone: 'unhyeongung', lngLat: UHG_AT, yawDeg: 0 },
  // 종묘 · 사직단 · 환구단: 같은 방식(기준점 고정 · 방향 없음)
  { id: 'jm-wall', zone: 'jongmyo', lngLat: JM_AT, yawDeg: 0 },
  { id: 'jm-halls', zone: 'jongmyo', lngLat: JM_AT, yawDeg: 0 },
  { id: 'jm-frames', zone: 'jongmyo', lngLat: JM_AT, yawDeg: 0 },
  { id: 'sj-wall', zone: 'sajik', lngLat: SJ_AT, yawDeg: 0 },
  { id: 'sj-halls', zone: 'sajik', lngLat: SJ_AT, yawDeg: 0 },
  { id: 'sj-frames', zone: 'sajik', lngLat: SJ_AT, yawDeg: 0 },
  { id: 'hg-wall', zone: 'hwangudan', lngLat: HG_AT, yawDeg: 0 },
  { id: 'hg-halls', zone: 'hwangudan', lngLat: HG_AT, yawDeg: 0 },
  { id: 'hg-frames', zone: 'hwangudan', lngLat: HG_AT, yawDeg: 0 },
  // 왕릉 · 석촌동 고분군 · 풍납토성 · 몽촌토성 움집터: 같은 방식(기준점 고정 · 방향 없음). 멀리서는 안 그린다
  { id: 'sjn-wall', zone: 'seonjeong', lngLat: SJN_AT, yawDeg: 0 },
  { id: 'sjn-halls', zone: 'seonjeong', lngLat: SJN_AT, yawDeg: 0 },
  { id: 'sjn-frames', zone: 'seonjeong', lngLat: SJN_AT, yawDeg: 0 },
  { id: 'jng-wall', zone: 'jeongneung', lngLat: JNG_AT, yawDeg: 0 },
  { id: 'jng-halls', zone: 'jeongneung', lngLat: JNG_AT, yawDeg: 0 },
  { id: 'uir-wall', zone: 'uireung', lngLat: UIR_AT, yawDeg: 0 },
  { id: 'uir-halls', zone: 'uireung', lngLat: UIR_AT, yawDeg: 0 },
  { id: 'uir-frames', zone: 'uireung', lngLat: UIR_AT, yawDeg: 0 },
  { id: 'hin-wall', zone: 'heonin', lngLat: HIN_AT, yawDeg: 0 },
  { id: 'hin-halls', zone: 'heonin', lngLat: HIN_AT, yawDeg: 0 },
  { id: 'hin-frames', zone: 'heonin', lngLat: HIN_AT, yawDeg: 0 },
  { id: 'tgn-wall', zone: 'taegang', lngLat: TGN_AT, yawDeg: 0 },
  { id: 'tgn-halls', zone: 'taegang', lngLat: TGN_AT, yawDeg: 0 },
  { id: 'skc-halls', zone: 'seokchon', lngLat: SKC_AT, yawDeg: 0 },
  { id: 'pnp-wall', zone: 'pungnap', lngLat: PNP_AT, yawDeg: 0 },
  { id: 'mcn-land', zone: 'mongchon', lngLat: MCN_AT, yawDeg: 0 },
  { id: 'mcn-halls', zone: 'mongchon', lngLat: MCN_AT, yawDeg: 0 },
  // 근현대 문화유산 여섯 곳: 같은 방식
  { id: 'wg-wall', zone: 'wongaksa', lngLat: WG_AT, yawDeg: 0 },
  { id: 'wg-halls', zone: 'wongaksa', lngLat: WG_AT, yawDeg: 0 },
  { id: 'wg-frames', zone: 'wongaksa', lngLat: WG_AT, yawDeg: 0 },
  { id: 'md-halls', zone: 'myeongdong', lngLat: MD_AT, yawDeg: 0 },
  { id: 'md-frames', zone: 'myeongdong', lngLat: MD_AT, yawDeg: 0 },
  { id: 's2-halls', zone: 'seoul284', lngLat: S2_AT, yawDeg: 0 },
  { id: 'sd-wall', zone: 'seodaemun', lngLat: SD_AT, yawDeg: 0 },
  { id: 'sd-halls', zone: 'seodaemun', lngLat: SD_AT, yawDeg: 0 },
  { id: 'sd-frames', zone: 'seodaemun', lngLat: SD_AT, yawDeg: 0 },
  { id: 'jg-halls', zone: 'jogyesa', lngLat: JG_AT, yawDeg: 0 },
  { id: 'jg-frames', zone: 'jogyesa', lngLat: JG_AT, yawDeg: 0 },
  { id: 'be-wall', zone: 'bongeunsa', lngLat: BE_AT, yawDeg: 0 },
  { id: 'be-halls', zone: 'bongeunsa', lngLat: BE_AT, yawDeg: 0 },
  { id: 'be-frames', zone: 'bongeunsa', lngLat: BE_AT, yawDeg: 0 },
];
// 모델이 앉는 자리의 지도 건물(OSM 광화문 외곽 49.5 × 13.3 m — 육축과 양옆 궁장 도막)을 뺀다: 그 안에 중심이 있는 조각 건물
// 도성문 둘레(OSM 육축 · 옹성 전체를 감싸는 원): 지도 건물 비우기와 도시 나무 비우기가 같이 쓴다.
// exact: 이 원은 문 외곽에 딱 맞아(tests/city_monuments.test.mjs) 기본 모드 필터가 반경을 1.5배로 키우지 않는다 — 키우면 바로 옆 건물까지 지워진다
export interface MonumentHide { lngLat:[number, number]; radiusM:number; minH:number; area?:[number, number][]; exact?:boolean }
export const GATE_YARDS:MonumentHide[] = [
  { lngLat: [126.97536025, 37.559986249999994] as [number, number], radiusM: 27, minH: 0, exact: true },
  { lngLat: [127.009594975, 37.571153975] as [number, number], radiusM: 43, minH: 0, exact: true },
];
export const MONUMENT_HIDES:MonumentHide[] = [
  ...GATE_YARDS,
  { lngLat: [126.976817, 37.575928] as [number, number], radiusM: 22, minH: 0 },
  // 세종대왕 동상 자리(받침 8.5 × 6.2 m): 지도 건물 조각이 받침 속에 들지 않게
  { lngLat: [126.97691, 37.57285] as [number, number], radiusM: 14, minH: 0 },
  // 경복궁 안: 둘레 안에 중심이 든 지도 건물은 모두 뺀다(전용 모델 · 한옥 틀이 대신 선다). 반경은 둘레 전체를 덮는 값 — 실제 판정은 area 다각형
  { lngLat: PALACE_AT, radiusM: 900, minH: 0, area: palaceRing() },
  // 창덕궁 안: 같은 방식(둘레 안에 중심이 든 지도 건물은 모두 뺀다)
  { lngLat: CDG_AT, radiusM: 900, minH: 0, area: cdgRing() },
  // 덕수궁 안: 같은 방식 + 담장 밖 중명전 터
  { lngLat: DSG_AT, radiusM: 900, minH: 0, area: dsgRing() },
  { lngLat: DSG_AT, radiusM: 900, minH: 0, area: jmjRing() },
  // 창경궁 안: 같은 방식
  { lngLat: CGG_AT, radiusM: 900, minH: 0, area: cggRing() },
  { lngLat: GHG_AT, radiusM: 400, minH: 0, area: ghgRing() },
  { lngLat: GHG_AT, radiusM: 400, minH: 0, area: hhmRing() },
  ...uhgHideRings().map(area => ({ lngLat: UHG_AT, radiusM: 300, minH: 0, area })),   // 운현궁: 전용 모델로 바꾼 건물 윤곽만
  // 종묘 · 사직단 · 환구단 안: 같은 방식
  { lngLat: JM_AT, radiusM: 900, minH: 0, area: jmRing() },
  { lngLat: SJ_AT, radiusM: 300, minH: 0, area: sjRing() },
  { lngLat: HG_AT, radiusM: 300, minH: 0, area: hgRing() },
  // 왕릉 · 고분군 · 토성 · 움집터: 숨김 둘레 안에 중심이 든 지도 건물을 뺀다(전용 모델 · 한옥 틀 · 상자가 대신 선다)
  ...sjnRings().map(area => ({ lngLat: SJN_AT, radiusM: 450, minH: 0, area })),
  ...jngRings().map(area => ({ lngLat: JNG_AT, radiusM: 200, minH: 0, area })),
  ...uirRings().map(area => ({ lngLat: UIR_AT, radiusM: 300, minH: 0, area })),
  ...hinRings().map(area => ({ lngLat: HIN_AT, radiusM: 450, minH: 0, area })),
  ...tgnRings().map(area => ({ lngLat: TGN_AT, radiusM: 700, minH: 0, area })),
  ...skcRings().map(area => ({ lngLat: SKC_AT, radiusM: 200, minH: 0, area })),
  ...pnpRings().map(area => ({ lngLat: PNP_AT, radiusM: 900, minH: 0, area })),
  ...mcnRings().map(area => ({ lngLat: MCN_AT, radiusM: 100, minH: 0, area })),
  { lngLat: WG_AT, radiusM: 500, minH: 0, area: wgRing() },
  { lngLat: MD_AT, radiusM: 500, minH: 0, area: mdRing() },
  { lngLat: S2_AT, radiusM: 400, minH: 0, area: s2Ring() },
  { lngLat: SD_AT, radiusM: 500, minH: 0, area: sdRing() },
  { lngLat: JG_AT, radiusM: 500, minH: 0, area: jgRing() },
  { lngLat: BE_AT, radiusM: 700, minH: 0, area: beRing() },
];

// 이 모델들이 있는 곳(광화문 · 경복궁 · 광화문광장 · 창덕궁 둘레): 화면이 이 둘레에 닿을 때만 코드를 받는다(첫 화면 · 다른 도시에서는 받지 않는다)
// bounds: 지도 화면의 메르카토르 사각 [서, 북, 동, 남](overlay 가 넘긴다)
const REGIONS:Record<string, { lngLat:[number, number]; radiusM:number }> = {
  gyeongbok: { lngLat: [126.9770, 37.5745], radiusM: 1500 },
  changdeokgung: { lngLat: CDG_AT, radiusM: 900 },
  deoksugung: { lngLat: DSG_AT, radiusM: 600 },
  changgyeonggung: { lngLat: CGG_AT, radiusM: 900 },
  gyeonghuigung: { lngLat: GHG_AT, radiusM: 400 },
  unhyeongung: { lngLat: UHG_AT, radiusM: 300 },
  jongmyo: { lngLat: JM_AT, radiusM: 700 },
  sajik: { lngLat: SJ_AT, radiusM: 300 },
  hwangudan: { lngLat: HG_AT, radiusM: 300 },
  seonjeong: { lngLat: SJN_AT, radiusM: 450 },
  jeongneung: { lngLat: JNG_AT, radiusM: 200 },
  uireung: { lngLat: UIR_AT, radiusM: 300 },
  heonin: { lngLat: HIN_AT, radiusM: 450 },
  taegang: { lngLat: TGN_AT, radiusM: 700 },
  seokchon: { lngLat: SKC_AT, radiusM: 200 },
  pungnap: { lngLat: PNP_AT, radiusM: 900 },
  mongchon: { lngLat: MCN_AT, radiusM: 230 },
  wongaksa: { lngLat: WG_AT, radiusM: 500 },
  myeongdong: { lngLat: MD_AT, radiusM: 500 },
  seoul284: { lngLat: S2_AT, radiusM: 400 },
  seodaemun: { lngLat: SD_AT, radiusM: 500 },
  jogyesa: { lngLat: JG_AT, radiusM: 500 },
  bongeunsa: { lngLat: BE_AT, radiusM: 700 },
  // 도성문: 문 둘레 100 m 안에 화면이 닿을 때만 그 문의 코드를 받는다
  sungnyemun: { lngLat: [126.97536025, 37.559986249999994], radiusM: 100 },
  heunginjimun: { lngLat: [127.009594975, 37.571153975], radiusM: 100 },
};
// zone 을 주면 그 구역만, 안 주면 어느 구역이든(화면이 닿으면 true)
export function monumentsInView(bounds:[number, number, number, number], zone?:string):boolean {
  return zone ? regionInView(bounds, REGIONS[zone]!) : Object.values(REGIONS).some(region => regionInView(bounds, region));
}
function regionInView(bounds:[number, number, number, number], REGION:{ lngLat:[number, number]; radiusM:number }):boolean {
  const [lng, lat] = REGION.lngLat, x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2, r = REGION.radiusM / (40075016.686 * Math.cos(lat * Math.PI / 180));
  return bounds[0] - r <= x && x <= bounds[2] + r && bounds[1] - r <= y && y <= bounds[3] + r;
}

// 팩에 기념물 자리 비우기를 덧붙인 복사본(한 번만 만들어 둔다 — 팩 참조가 바뀌면 건물 타일을 전부 다시 짓는다)
interface HidePack { landmarkHide?:{ lngLat:[number, number]; radiusM:number; minH:number; area?:[number, number][] }[] }
const withHides = new WeakMap<object, object>();
export function withMonumentHides<P extends HidePack>(pack:P):P {
  let out = withHides.get(pack) as P | undefined;
  if (!out) { out = { ...pack, landmarkHide: [...(pack.landmarkHide || []), ...MONUMENT_HIDES] }; withHides.set(pack, out) }
  return out;
}

// 기본 모드(MapLibre 건물 층 bm-bld · bm-bld3d)에서 같은 자리 건물을 빼는 필터: 도시 엔진의 자리 비우기(위)는 이 층에 닿지 않는다.
// `within` 은 건물 전체가 다각형 안에 들어야 참이라, 반경을 키운 열여섯 각형으로 건물 윤곽 전체를 감싼다(반경 × 1.5).
export function monumentBuildingFilter():unknown[] {
  const rings = MONUMENT_HIDES.map(({ lngLat: [lng, lat], radiusM, area, exact }) => {
    if (area) return [[...area, area[0]!]];
    const ring:[number, number][] = [], r = radiusM * (exact ? 1.03 : 1.5);   // 열여섯 각형의 안쪽 원이 반경 이상이 되게(1.03 × cos(π/16) > 1)
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ring.push([lng + Math.cos(a) * r / (111320 * Math.cos(lat * Math.PI / 180)), lat + Math.sin(a) * r / 110574]) }
    ring.push(ring[0]!); return [ring];
  });
  return ['!', ['within', { type: 'MultiPolygon', coordinates: rings }]];
}
