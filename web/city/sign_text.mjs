// web/city/sign_text.mts
var SIGN_WORDS = {
	fascia: [
		"치킨",
		"편의점",
		"약국",
		"부동산",
		"미용실",
		"노래방",
		"PC방",
		"김밥",
		"분식",
		"세탁소",
		"안경원",
		"카페",
		"커피",
		"떡볶이",
		"국밥",
		"순대국",
		"삼겹살",
		"갈비",
		"횟집",
		"반점",
		"정육점",
		"마트",
		"슈퍼마켓",
		"꽃집",
		"빵집",
		"베이커리",
		"휴대폰",
		"철물점",
		"감자탕",
		"호프",
		"당구장",
		"사진관",
		"문구",
		"서점",
		"헤어",
		"네일",
		"족발 · 보쌈",
		"냉면",
		"칼국수",
		"부대찌개"
	],
	upper: [
		"수학학원",
		"영어학원",
		"태권도",
		"피아노",
		"치과",
		"내과",
		"소아과",
		"한의원",
		"정형외과",
		"피부과",
		"이비인후과",
		"공인중개사",
		"세무회계",
		"법무사",
		"필라테스",
		"헬스",
		"스터디카페",
		"독서실",
		"미술학원",
		"교회",
		"노래연습장",
		"당구클럽",
		"보습학원",
		"안과"
	],
	blade: [
		"치킨",
		"약국",
		"노래방",
		"호프",
		"당구장",
		"PC방",
		"미용실",
		"한의원",
		"치과",
		"내과",
		"학원",
		"태권도",
		"사우나",
		"감자탕",
		"국밥",
		"카페",
		"노래연습장",
		"부동산",
		"피아노",
		"헬스",
		"교회",
		"안경",
		"세탁",
		"분식"
	]
};
var SIGN_ATLAS = {
	size: 1024,
	hW: 256,
	hH: 40,
	hCols: 4,
	vW: 40,
	vH: 256,
	vY: 656
};
var FONT = "\"Noto Sans KR\",\"Apple SD Gothic Neo\",\"Malgun Gothic\",\"Nanum Gothic\",sans-serif";
function buildSignAtlas() {
	const A = SIGN_ATLAS, doc = globalThis.document;
	if (!doc?.createElement) return null;
	const c = doc.createElement("canvas");
	c.width = c.height = A.size;
	const g = c.getContext("2d", { willReadFrequently: true });
	if (!g) return null;
	g.fillStyle = "#000";
	g.fillRect(0, 0, A.size, A.size);
	g.fillStyle = "#fff";
	g.textBaseline = "middle";
	g.textAlign = "left";
	const hWidth = /* @__PURE__ */ new Float32Array(64), vLen = /* @__PURE__ */ new Float32Array(24);
	[...SIGN_WORDS.fascia, ...SIGN_WORDS.upper].forEach((w, i) => {
		const x0 = i % A.hCols * A.hW, y0 = Math.floor(i / A.hCols) * A.hH, fs = Math.round(A.hH * .8);
		g.font = `900 ${fs}px ${FONT}`;
		const m = g.measureText(w).width, k = Math.min(1, (A.hW - 8) / m);
		g.save();
		g.translate(x0 + 4, y0 + A.hH / 2 + 1);
		g.scale(k, 1);
		g.fillText(w, 0, 0);
		g.restore();
		hWidth[i] = (Math.min(m, A.hW - 8) + 8) / A.hW;
	});
	SIGN_WORDS.blade.forEach((w, i) => {
		const chars = w.match(/[A-Za-z0-9]+|./g), x0 = i * A.vW, fs = Math.round(A.vW * .8), step = Math.min(fs * 1.08, (A.vH - 8) / chars.length);
		g.font = `900 ${fs}px ${FONT}`;
		g.textAlign = "center";
		chars.forEach((ch, j) => {
			const m = g.measureText(ch).width, k = Math.min(1, (A.vW - 4) / m);
			g.save();
			g.translate(x0 + A.vW / 2, A.vY + 4 + step * (j + .5));
			g.scale(k, Math.min(1, step / fs));
			g.fillText(ch, 0, 0);
			g.restore();
		});
		g.textAlign = "left";
		vLen[i] = (step * chars.length + 8) / A.vH;
	});
	const px = g.getImageData(0, 0, A.size, A.size).data, data = new Uint8Array(A.size * A.size);
	for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
	return {
		data,
		hWidth,
		vLen
	};
}
export { SIGN_ATLAS, SIGN_WORDS, buildSignAtlas };
