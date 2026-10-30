import * as maplibregl from './vendor/maplibre-gl.mjs';
import {key,normStatus,createRouter,NEW_NAMES} from './lib/routing.mts';
import {seoulSun,sunPosition as sunAt} from './lib/sun.mts';
import {initJourney} from './lib/journey-ui.mts';import {drawJourney,clearJourney} from './ui/journey_sheet.tsx';   // 길찾기 시트 몸통은 화면 조각(Preact)이 그린다
import {createCoasterTrack} from './modes/coaster/track.mts';   // 롤코 선로 층
import {createCoasterGeometry} from './modes/coaster/geometry.mts';   // 롤코 길 · 언덕 계산
import {createCoasterMotion} from './modes/coaster/motion.mts';   // 롤코 주행 속도 · 탄 거리
import {createCoasterRide} from './modes/coaster/ride.mts';   // 롤코 1인칭 타기
import {createStationSearch} from './ui/search.mts';   // 역 검색
import {createBottomSheet} from './ui/sheet.mts';   // 아래 시트 · 따라가기
import {createPopups} from './ui/popups.mts';   // 열차 · 역 정보창
import './ui/station_sheet.tsx';import './bus/sheet_view.tsx';import './ui/journey_sheet.tsx';import './ui/train_sheet.tsx';import 'preact';import 'preact/jsx-runtime';import './components/route_card.tsx';import './components/step_list.tsx';import './components/segmented.tsx';import './components/chip.tsx';import './components/icons.tsx';import './components/sheet_frame.tsx';import './components/search_field.tsx';import './components/drawer.tsx';import './components/login_button.tsx';import './components/station_sheet.tsx';import './components/train_sheet.tsx';import './components/live_notice.tsx';   // (역 도착 · 버스 · 길찾기 · 열차 시트 화면 조각 · Preact · 길찾기 시트 · 아래 시트 · 검색 · 서랍이 쓰는 기초 컴포넌트: 같은 단계에서 요청)
import {settingsMenu as menu} from './ui/settings_menu.tsx';   // 설정 서랍의 몸통 칸(테마 · 도시 모드 · 성능) — 눌림 · 숨김은 이 창구로
import {createJourneyMap} from './ui/journey.mts';   // 여정 지도 표시
import {serverUrl,appMapMode} from './lib/server_url.mts';   // 서버 주소 한 곳(앱 지도 모드면 운영 서비스 주소)
import {createAppBridge} from './ui/app_bridge.mts';   // 앱 ↔ 지도 다리(앱 지도 모드에서만 켠다)
import {createTrainOverlay} from './map/overlay.mts';   // 열차 캔버스 · 역 이름표 캔버스 그리기 차례
import {registerTransitLayers,registerLocationLayers,registerExitLayers,addBasemap as addBasemapLayers,BASEMAP_LAYERS} from './map/layers.mts';   // 정적 층 등록 · 바탕 지도
import {createMapTheme} from './map/theme.mts';   // 테마 · 지도 색 · 해 위치 아이콘
import {createUserPrefs} from './user/prefs.mts';   // 내 설정 창구(테마 · 지도 색 — 지금은 이 기기)
import {createModeRegistry} from './modes/index.mts';   // 모드 목록 · 설정 상속(기본 → 모드 → 내 설정)
import {createModeController,STARCRAFT,NATIONS,CITY_FAMILY} from './modes/transition.mts';   // 모드 전환: 지금 · 원하는 모드, 마지막 요청, 롤코 배속
import './modes/merge.mts';   // (모드 목록이 부르는 합치기: 같은 단계에서 요청)
import BASIC_MODE from './modes/basic/index.mts';   // 기본 모드: 모든 설정의 원본
import './modes/basic/palette.mts';   // (기본 모드의 지도 색 자료: 같은 단계에서 요청)
import CITY_STYLE from './modes/basic/city.mts';   // city-life: the one style pack (colours, metres, zooms) the city reads — 기본 모드의 도시 팩 원본
import SIMCITY_MODE from './modes/simcity/index.mts';
import JOSEON_MODE from './modes/joseon/index.mts';
import './modes/joseon/style.mts';   // (조선 모드의 도시 팩 덧쓰기: 같은 단계에서 요청)
import COASTER_MODE from './modes/coaster/index.mts';
import STARCRAFT_MODES from './modes/starcraft/index.mts';
import RETRO_MODE from './modes/retro/index.mts';   // 레트로: 심시티 도시를 도트로
import './modes/retro/style.mts';   // (레트로 도시 팩 덧쓰기: 같은 단계에서 요청)
import NATION_MODES from './modes/nations/index.mts';   // 나라: 나라마다 모드 하나(그리스 …)
import './modes/nations/greece.mts';import './modes/nations/netherlands.mts';import './modes/nations/paris.mts';import './modes/nations/egypt.mts';   // (나라 도시 팩: 같은 단계에서 요청)
import './modes/starcraft/style.mts';   // (스타크래프트 종족 도시 팩: 같은 단계에서 요청)
import {UNIT_SHAPES} from './modes/starcraft/unit_shapes.mts';   // 스타크래프트 유닛 모양(Codex 시안)
import {unitBusLook} from './modes/starcraft/units.mts';   // 스타크래프트 버스 모양 등록 자료(유닛 → 버스 메시)   // 스타크래프트: 종족 셋(테란 · 저그 · 프로토스), 모드 하나씩
import {SunShadowLayer,hull} from './map/sun.mts';   // 해 그림자 층
import {createStationLabels} from './map/labels.mts';   // 역 이름표 자료
import {StationNameLayer,ExitPillars} from './map/platform.mts';   // 승강장 막대 · 출구 통로 · 출구 기둥
import {createTrainPlanner} from './trains/plan.mts';   // 열차 예측
import {createLiveFeed} from './trains/live_feed.mts';   // 실시간 열차 받기 · 기록
import {trainLayerClass,buildingDepthClass} from './trains/draw.mts';   // 열차 그리기 · 건물 깊이
import {createBusLayer} from './bus/layer.mts';import {drawBusSheet,clearBusSheet} from './bus/sheet_view.tsx';   // bus: optional Seoul routes, stops and live vehicles
import {registerBusLook} from './bus/mesh.mts';   // 버스 모양 등록(조선 가마)
import {AvatarRenderer,createMyMotion,registerAvatar,avatarScale,AVATAR_MINZOOM} from './map/avatar.mts';   // 내 위치 캐릭터(줌 15 부터 점 대신)
import * as sproutAvatar from './map/avatars/sprout.mts';   // 내 위치 캐릭터 모양(모드 설정 me.look): 기본 새싹 볼빵 후디
import * as builderAvatar from './map/avatars/builder.mts';import * as seonbiAvatar from './map/avatars/seonbi.mts';import * as visitorAvatar from './map/avatars/visitor.mts';
import * as scvAvatar from './map/avatars/scv.mts';import * as droneAvatar from './map/avatars/drone.mts';import * as probeAvatar from './map/avatars/probe.mts';   // 스타크래프트 종족 일꾼(테란 SCV · 저그 드론 · 프로토스 프로브)   // 심시티 건설 반장 · 조선 선비 · 롤코 놀이공원 아이(작은 상자 목록이라 첫 화면에 같이)
import {buildPalanquinMesh,buildChorongPostMesh,buildChorongGlowMesh} from './modes/joseon/palanquin.mts';   // 조선 모드의 가마 · 청사초롱 정류장 메시
import {journeyCasingPaint,journeyRidePaint,journeyStopPaint} from './lib/journey_map_style.mts';   // bus: one journey presentation for route numbers and search results
import './modes/basic/park.mts';   // coaster: shared park palette and metre/pixel dimensions — 기본 모드의 공원 자료(같은 단계에서 요청)
import './modes/coaster/metrics.mts';   // (공원 치수 계산: 같은 단계에서 요청)
import {buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS} from './modes/coaster/track_mesh.mts';   // 롤코 선로 메시 · 셰이더(선로 층에 넘김)
import {NightLayer} from './modes/coaster/night.mts';
import {RIDE_ZOOM,rideFov,RIDE_NEAR_M,COCKPIT_NEAR_M,nearMatrix,RIDE_FAR_M,seatRows,seatIndex,seatNumber,seatEye,rideCamera,seatPickerHTML,seatLabel} from './modes/coaster/first_person.mts';   // 롤코 1인칭: 자리 고르기 · 그 자리 눈의 카메라
import {addCityLayers,applyCityStyle,applyGroundTexture,cityPalette} from './city/style.mts';   // city-life: the miniature city's ground (zone floors, roads, lane marks)
import {CityLife} from './city/life.mts';
import {platformStroke} from './lib/platform_stroke.mts';
import {drawStationSigns,signRows,signTextSize,perspectiveRatio,placeholderText,sortLines,signCollisionLayout,signAnchor} from './lib/station_signs.mts';   // 역 이름표: 열차 · 고가 위에 떠 있는 팻말
import {catchup,catchupAt} from './lib/train_catchup.mts';   // 앞선 예측을 따라잡을 때 더하는 속도에 상한
import {offsetCoords,trackStart,extendStart,closestPlatformPoint} from './lib/platform_route.mts';
import {CityViaduct} from './city/viaduct.mts';
import {stops as snapStops} from './city/viaduct_snap.mjs';   // 기본·심시티: 도로 위로 옮긴 지하 역 점(곧은 승강장이면 방향도)   // city-life: 심시티 — the viaduct every line rides in that mode (deck, piers, roofed platforms; the trains are lifted onto it below)
// 타입만(빌드 결과에 없다 — 요청 차례 그대로)
import type {Map as MapLibre,CustomLayerInterface,GeoJSONSource} from 'maplibre-gl';
import type {LinePaths,FeedTrain} from './lib/routing.mts';
import type {Settings,ModeDefinition} from './modes/merge.mts';
import type {MapStation,TrainPlan,LiveTrain,Merc} from './trains/types.mts';
import type {TrainLive} from './trains/draw.mts';
import type {TrainOverlayDeps} from './map/overlay.mts';
import type {StationRect} from './map/platform.mts';
import type {BusLook} from './bus/mesh.mts';import type {BusSheetView} from './bus/layer.mts';
import type {EdgeGeom,EdgeCache,PathPt} from './modes/coaster/types.mts';
import type {RailFrame} from './modes/coaster/ride_track.mts';

type LngLat=[number,number];
// 지금 모드 설정(modes/basic/index.mts 가 원본): 설정을 받는 모듈들이 읽는 칸 + 본체가 읽는 칸
// 도시 팩(modes/basic/city.mts 가 원본 · 모드가 덧쓴 것): 받는 엔진들이 읽는 칸 + 본체가 읽는 칸(밤 빛 · 그림자 · 한옥 높이)
type CityPack=import('./city/mesh.mts').MeshPack&import('./city/viaduct.mts').ViaductPack&import('./city/life.mts').LifePack&{
  night?:NightPack|null;modes?:Record<string,ShadowLook|undefined>;lighting?:{shadow?:{maxLengthM?:number;color?:string}};hanok:{tall:{towerMinH:number}};train?:{turtleShip?:unknown}};
interface ShadowLook{shadowOpacity?:Partial<Record<'dark'|'light',number>>}
interface RuntimeOwnSettings{
  track:{kind:string;platform:string};
  trains:{predictStops:number;timeWarp:boolean;body?:string};
  city:{enabled:boolean;tone:string;pack:CityPack};
  park:{enabled:boolean};
  map:{exitLook:string;fov?:number|null;paletteKind:string;pixel:{enabled:boolean;size:number;palette:string;outline:boolean};park:Record<'dark'|'light',{lightK:number;light:string}>};
  sun:{light:string;lowHouseM?:number|null};
}
// 도시 팩 night(밤 빛): 불빛 · 바닥 빛 · 번짐
interface NightPack{lights?:unknown;ground?:unknown;bloom?:{phone?:boolean;strength?:number;threshold?:number;knee?:number;levels?:number;tint?:string}|null}
type ModeSettings=Settings&RuntimeOwnSettings&TrainLive['settings']&TrainOverlayDeps['live']['settings']&Parameters<typeof createMapTheme>[0]['live']['settings']
  &Parameters<typeof createPopups>[0]['live']['settings']&Parameters<typeof createJourneyMap>[0]['live']['settings'];
type ModeRegistry=Omit<ReturnType<typeof createModeRegistry>,'settings'>&{settings(name?:string,user?:unknown):ModeSettings};
type ModeCtl=Omit<ReturnType<typeof createModeController>,'settings'>&{settings(user?:unknown):ModeSettings};
// 길 찾기 도우미(lib/routing): 본체의 역 자료는 좌표가 있는 MapStation
type Router=Omit<ReturnType<typeof createRouter>,'byId'|'stationByLine'|'route'>&{byId:Map<number,MapStation>;stationByLine:Map<string,MapStation>;route:(t:FeedTrain,s:MapStation)=>{previous:MapStation|undefined;ahead:MapStation[]}};
// 출구(exits.json · pipeline/build_entrances.py): 역 번호 → [경도, 위도, 출구 번호, 휠체어]
type Exit=[number,number,string,number?];
// 지도 캔버스의 GL 효과 층(빛 번짐 · 도트 색표): 효과는 처음 그릴 때 만든다
// #fps 점검: 지도 한 프레임 그리기(MapLibre 안쪽 함수)를 감싸 잰다
type FpsMap=Omit<MapLibre,'_render'>&{_render:(...a:unknown[])=>unknown};
interface FxLayer<Fx>extends CustomLayerInterface{fx:Fx|null;gl?:WebGLRenderingContext|WebGL2RenderingContext}
// 열차 간격 맞추기(spaceTrains): 계획 · 자세 · 반 길이 · 1 m, 선로 위 자리와 방향
interface Spaced{p:RuntimePlan;pose:Pose;half:number;m:number;x:number;y:number;f:[number,number]}
// 역 사이 선로 도형(withCum) — 땅 위 화면 경로(basicDrawGeom)는 그 경로(track)를 붙여 둔다
type Geom=EdgeGeom&{track?:BasicTrack};
interface BasicTrack{zoom:number;train:LngLat[];coords:LngLat[];shifted:boolean}
// 선로 위 점(trackPoint): 자리 · 진행 방향 f · 오른쪽 r · 옆 칸 off(px) · 높이 h · 기울기 roll
interface TrackPt{x:number;y:number;f:[number,number];r:[number,number];off:number;h:number;roll?:number}
// 롤코 칸 · 레일 틀이 읽는 선로 위 점(trackPoint 결과 — 받는 쪽마다 r 을 배열로 적는다)
interface FramePt{x:number;y:number;h:number;off:number;r:readonly number[];roll?:number}
// 받는 모듈의 deps(넘기는 자리에서 그 모양으로 — 같은 자료를 모듈마다 쓰는 칸만 적었다)
type TransitDeps=Parameters<typeof registerTransitLayers>[0];
type ThemeDeps=Parameters<typeof createMapTheme>[0];
type BusDeps=NonNullable<Parameters<typeof createBusLayer>[0]>;
type JourneyLeg=import('./ui/journey.mts').JourneyLeg;type JourneyPlan=import('./ui/journey.mts').JourneyPlan;
type Theme=Parameters<ThemeDeps['cityPalette']>[0];
type CityStyleMap=import('./city/style.mts').CityStyleMap;
// 열차 예측(trains/plan) 계획에 본체가 붙이는 칸: 1 m(메르카토르) · 새 자료로 옮겨 그리는 출발점
type RuntimePlan=Omit<TrainPlan,'hold'|'creep'|'glide'>&{hold?:number|null;creep?:TrainPlan['creep']|null;glide?:TrainPlan['glide']|null;m?:number;blend?:{at:number;x:number;y:number}|null};
interface Pose{dist:number;moving:boolean;stand?:{t:number;dur:number;st:MapStation}|null}
// 승강장 자리(buildStationFeatures): 선 · 노선 칸 · 폭(m) · 승강장 몫 — 리본은 가운데 · 반 길이 · 출구 쪽 통로 끝도
interface Rect{coords:LngLat[];offset:number;widthM:number;plat:number;center?:LngLat;half?:number;reach?:LngLat|null}
// track_shapes.json(pipeline/build_track_shapes.py) — 옛 판은 edges 없이 이 묶음 자체가 edges
interface TrackShapes{edges?:Record<string,LngLat[]>;stops?:Record<string,LngLat>;stopDirs?:Record<string,LngLat>;stopHalf?:Record<string,number>;platformHalf?:Record<string,number>;stopWidth?:Record<string,number>;stopReach?:Record<string,LngLat>}
// 점검 창구(window.__subwayWebGL — 점검 스크립트가 쓴다) · 해 시각 미리 보기(__sunTime)
declare global{interface Window{__sunTime?:Date;__subwayWebGL:Record<string,unknown>}}

// 모드 설정: 기본이 원본, 모드는 다른 것만. 시작할 때 한 번 검사 · 합치고 얼려 둔다(잘못된 정의는 여기서 멈춘다)
const modes=createModeRegistry([BASIC_MODE,SIMCITY_MODE,JOSEON_MODE,COASTER_MODE,...STARCRAFT_MODES,RETRO_MODE,...NATION_MODES] as ModeDefinition[]) as ModeRegistry;
registerAvatar('sprout',sproutAvatar);registerAvatar('builder',builderAvatar);registerAvatar('seonbi',seonbiAvatar);registerAvatar('visitor',visitorAvatar);registerAvatar('scv',scvAvatar);registerAvatar('drone',droneAvatar);registerAvatar('probe',probeAvatar);   // 내 위치 캐릭터 모양(이름 = 모드 설정 me.look)
for(const k of ['siegeTank','ultralisk','reaver'])registerBusLook(k,unitBusLook(k) as BusLook);   // 스타크래프트 버스: 시즈 탱크 · 울트라리스크 · 리버
registerBusLook('palanquin',{build:buildPalanquinMesh,carriers:true,headlights:false,stop:buildChorongPostMesh,stopGlow:buildChorongGlowMesh,stopGrowFrom:18});   // 조선 모드의 버스 모양: 가마꾼은 움직이는 동안 걷고, 밤에 전조등 대신 초롱(메시 안) · 정류장은 청사초롱 장대(밤에 불)
const JOSEON_STYLE=modes.settings('joseon').city.pack;   // 조선 모드: the same city in packed earth and 기와집 (cityPack()) — 기본 팩 + 조선 덧쓰기, 한 번 합쳐 얼린 것
const json=(id:string):unknown=>JSON.parse(document.getElementById(id)!.textContent!);
const stations=(json('stationData') as MapStation[]).map(s=>NEW_NAMES[s.name]?{...s,name:NEW_NAMES[s.name]!}:s),counts=json('lineCounts'),paths=json('linePaths') as LinePaths;
const colors:Record<string,string>={'1호선':'#0052A4','2호선':'#00A84D','3호선':'#EF7C1C','4호선':'#00A5DE','5호선':'#996CAC','6호선':'#CD7C2F','7호선':'#747F00','8호선':'#E6186C','9호선':'#BDB092','GTX-A':'#9A6292','경강선':'#0054A6','경의중앙선':'#77C4A3','경춘선':'#178C72','공항철도':'#0090D2','김포골드라인':'#AD8605','서해선':'#8FC31F','수인분당선':'#F5A200','신림선':'#6789CA','신분당선':'#D4003B','에버라인선':'#6FB245','우이신설선':'#B7C452','의정부선':'#FDA600','인천1호선':'#7CA8D5','인천2호선':'#ED8B00'};
const HOME={center:[126.98,37.53] as LngLat,zoom:10},LINE_GAP=5;
const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
const router=createRouter({stations,paths}) as unknown as Router,{byId,stationByLine,route,learnDirections}=router;
const sunPosition=(date=window.__sunTime||new Date())=>sunAt(date);   // __sunTime: preview another time of day
const merc=(s:MapStation&{m?:Merc})=>(s.m??=maplibregl.MercatorCoordinate.fromLngLat([s.lon,s.lat]));

// Shared track: every line on an edge gets a stable slot. Geometry is always emitted
// lower id → higher id so line-offset (which is relative to drawing direction) puts
// each line on the same side no matter which way its GTFS path runs.
const edgeLines=new Map<string,Set<string>>();
Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((b,i)=>{const k=edgeKey(ids[i]!,b);if(!edgeLines.has(k))edgeLines.set(k,new Set());edgeLines.get(k)!.add(line)})));
const edgeOffset=(line:string,a:number,b:number)=>{const shared=[...(edgeLines.get(edgeKey(a,b))||[line])].sort((x,y)=>x.localeCompare(y,'ko'));return (shared.indexOf(line)-(shared.length-1)/2)*LINE_GAP};
// Real track geometry (OSM, built by build_track_shapes.py), keyed line:lo:hi and drawn lo→hi.
// Edges without a shape fall back to a straight station-to-station segment.
// Stops are each station projected onto that line's track, so a transfer station has one on-track point per line.
let shapes:Record<string,LngLat[]>={},stops:Record<string,LngLat>={},stopDirs:Record<string,LngLat>={},stopHalf:Record<string,number>={},platformHalf:Record<string,number>={},stopWidth:Record<string,number>={},stopReach:Record<string,LngLat>={};   // stopDirs: platform direction (east, north) per line:stop, along its street   // stopReach: 출구가 한쪽 끝 밖에 몰린 역의 통로 끝 [lon, lat]
// 기본·심시티는 도로 맞춤 경로 끝과 같은 옮긴 역 점을, 롤코는 원래 역 점(stops)을 써요. 원본 stops는 바꾸지 않아요.
const stopPos=(line:string,s:MapStation):LngLat=>{const k=`${line}:${s.id}`,m=(snapStops as Record<string,number[]|undefined>)[k];return m?[m[0]!,m[1]!]:stops[k]||[s.lon,s.lat]};   // 롤코도 같은 역 점: 롤코가 심시티 고가(cityGeom) 위를 달리게 된 뒤(4899978)에도 원본 역 점을 써서 승강장이 어긋났다(2026-10-10 화랑대)
const stopMerc=new Map<string,Merc>(),mercStop=(line:string,s:MapStation)=>{const k=`${line}:${s.id}`;let m=stopMerc.get(k);if(!m){m=maplibregl.MercatorCoordinate.fromLngLat(stopPos(line,s));stopMerc.set(k,m)}return m};
// OSM track polylines are simplified to a few metres, which reads as kinks when zoomed in;
// round them with Chaikin corner-cutting (endpoints stay put so edges still meet at the stop).
function chaikin(pts:LngLat[],rounds=3){
  for(let r=0;r<rounds&&pts.length>2;r++){
    const out:LngLat[]=[pts[0]!];
    for(let i=0;i<pts.length-1;i++){const a=pts[i]!,b=pts[i+1]!;
      if(i>0)out.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25]);
      if(i<pts.length-2)out.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}
    out.push(pts[pts.length-1]!);pts=out;
  }
  return pts;
}
const smoothCache=new Map<string,LngLat[]>();
const edgeCoords=(line:string,lo:number,hi:number):LngLat[]=>{const k=`${line}:${lo}:${hi}`;if(!shapes[k])return [stopPos(line,byId.get(lo)!),stopPos(line,byId.get(hi)!)];let c=smoothCache.get(k);if(!c){c=chaikin(shapes[k]);smoothCache.set(k,c)}return c};
// Where a station's label sits: its point on the selected line, else the middle of its per-line points.
function labelPos(s:MapStation){if(selected!=='all'&&s.lines.some(x=>x.name===selected))return stopPos(selected,s);const p=s.lines.map(x=>stopPos(x.name,s));return [p.reduce((a,c)=>a+c[0],0)/p.length,p.reduce((a,c)=>a+c[1],0)/p.length]}
const basicRouteCache=new Map<string,BasicTrack>();
const terminalStops=new Set<string>(),stopLinks=new Map<string,Set<number>>();{   // stopLinks: line:역 → 그 노선의 이웃 역들
  for(const [line,chunks] of Object.entries(paths))for(const ids of chunks)for(let i=1;i<ids.length;i++)for(const [a,b] of [[ids[i-1]!,ids[i]!],[ids[i]!,ids[i-1]!]] as [number,number][]){const k=`${line}:${a}`;if(!stopLinks.has(k))stopLinks.set(k,new Set());stopLinks.get(k)!.add(b)}
  for(const [key,set] of stopLinks)if(set.size===1)terminalStops.add(key);
}
// 공유 선로 칸이 역 앞뒤로 바뀌는 역(청량리 1호선: 제기동 쪽은 혼자, 회기 쪽은 경의중앙·경춘과 셋)은 승강장 안을 한 칸에 두고
// 승강장 밖 SLOT_EASE_M 동안 구간의 칸으로 옮겨 가요. 역의 칸은 함께 쓰는 노선이 가장 많은 이웃 구간의 칸(lo→hi 방향 기준).
const SLOT_EASE_M=80;
function stopSlot(line:string,id:number,lo:number,hi:number){
  let best:{size:number;o:number}|null=null;
  for(const n of stopLinks.get(`${line}:${id}`)||[]){
    const a=Math.min(id,n),b=Math.max(id,n),size=edgeLines.get(edgeKey(a,b))?.size||1,o=a===lo&&b===hi?edgeOffset(line,a,b):edgeOffset(line,a,b)*((id===hi)===(id===a)?1:-1);
    if(!best||size>best.size||size===best.size&&Math.abs(o)<Math.abs(best.o))best={size,o};
  }
  return best?best.o:edgeOffset(line,lo,hi);
}
function basicTrack(line:string,lo:number,hi:number):BasicTrack{
  const key=`${line}:${lo}:${hi}`,mid=edgeOffset(line,lo,hi),sLo=stopSlot(line,lo,lo,hi),sHi=stopSlot(line,hi,lo,hi),shifted=Boolean(mid||sLo||sHi),zoom=shifted?map.getZoom():0;
  let cached=basicRouteCache.get(key);if(cached?.zoom===zoom)return cached;
  const hLo=(platformHalf[`${line}:${lo}`]||PLATFORM_HALF)+5,hHi=(platformHalf[`${line}:${hi}`]||PLATFORM_HALF)+5,ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
  const slot=(d:number,total:number)=>{const a=1-ease((d-hLo)/SLOT_EASE_M),b=1-ease((total-d-hHi)/SLOT_EASE_M);return (sLo*a+sHi*b+mid*Math.max(0,1-a-b))/Math.max(1,a+b)};
  const train=offsetCoords(cityCoords(line,lo,hi),sLo===mid&&sHi===mid?mid:slot,map.getZoom()) as LngLat[],coords=[...train];
  const terminal=(id:number)=>terminalStops.has(`${line}:${id}`);
  if(terminal(lo))coords.unshift(extendStart(train,platformHalf[`${line}:${lo}`]||PLATFORM_HALF) as LngLat);
  if(terminal(hi))coords.push(extendStart([...train].reverse(),platformHalf[`${line}:${hi}`]||PLATFORM_HALF) as LngLat);
  cached={zoom,train,coords,shifted};basicRouteCache.set(key,cached);return cached;
}
function buildLineFeatures(){
  const features:GeoJSON.Feature<GeoJSON.LineString>[]=[],drawn=new Set<string>(),kind=modeCtl.settings().track.kind;
  Object.entries(paths).forEach(([line,chunks])=>chunks.forEach(ids=>ids.slice(1).forEach((b,i)=>{
    const lo=Math.min(ids[i]!,b),hi=Math.max(ids[i]!,b),id=`${line}:${lo}:${hi}`;
    if(drawn.has(id)||!byId.has(lo)||!byId.has(hi))return;drawn.add(id);
    const coords=kind==='coaster'?coasterPath(line,lo,hi).pts.map(q=>new maplibregl.MercatorCoordinate(q.x,q.y).toLngLat().toArray()):kind==='viaduct'?cityCoords(line,lo,hi):basicTrack(line,lo,hi).coords;   // 롤코는 고유 경로, 기본·심시티는 도로 맞춤 경로를 우선해요.
    features.push({type:'Feature',properties:{line,color:colors[line],offset:kind==='ground'?0:edgeOffset(line,lo,hi)},geometry:{type:'LineString',coordinates:coords}});
  })));
  return features;
}
const edgeGeom:EdgeCache=new Map();
// 역 사이 열차 경로는 도로 맞춤 경로를 우선하고, 롤코는 coasterPath를 유지해요.
function geom(line:string,a:number,b:number):Geom{return modeCtl.settings().track.kind==='coaster'?coasterPath(line,a,b):cityGeom(line,a,b)}
// 기본·심시티에서 스냅이 있으면 노선·열차·승강장·여정이 같은 도로 맞춤 경로를 따라가요.
// 스냅이 없으면 기존 선로 경로를 써요(롤코도 같은 경로 — 고가 위를 달려요).
const cityCoords=(line:string,lo:number,hi:number):LngLat[]=>cityViaduct.snapped(line,lo,hi)||edgeCoords(line,lo,hi);
function cityGeom(line:string,a:number,b:number):Geom{const lo=Math.min(a,b),hi=Math.max(a,b),sn=cityViaduct.snapped(line,lo,hi);if(!sn)return realGeom(line,a,b);const id=`s:${line}:${lo}:${hi}`;let g=edgeGeom.get(id) as Geom|undefined;if(g)return g;g=withCum(sn.map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));edgeGeom.set(id,g);return g}
function basicDrawGeom(line:string,a:number,b:number):Geom{
  const lo=Math.min(a,b),hi=Math.max(a,b),track=basicTrack(line,lo,hi);if(!track.shifted)return cityGeom(line,a,b);
  const key=`b:${line}:${lo}:${hi}`;
  let g=edgeGeom.get(key) as Geom|undefined;if(g?.track===track)return g;
  g=withCum(track.train.map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));g.track=track;edgeGeom.set(key,g);return g;
}
const withCum=(pts:PathPt[]):Geom=>{const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]!+Math.hypot(pts[i]!.x-pts[i-1]!.x,pts[i]!.y-pts[i-1]!.y));return {pts,cum,total:cum[cum.length-1]!}};
function realGeom(line:string,a:number,b:number):Geom{
  const lo=Math.min(a,b),hi=Math.max(a,b),id=`${line}:${lo}:${hi}`;
  let g=edgeGeom.get(id) as Geom|undefined;if(g)return g;
  g=withCum(edgeCoords(line,lo,hi).map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)));edgeGeom.set(id,g);return g;
}
// Point and heading at fraction k of the way from station `from` to station `to` along the track.
function along(line:string,from:MapStation,to:MapStation,k:number):{x:number;y:number;f:[number,number]}{
  if(from===to){const m=mercStop(line,from);return {x:m.x,y:m.y,f:[0,-1]}}
  const g=modeCtl.settings().track.kind==='ground'?basicDrawGeom(line,from.id,to.id):geom(line,from.id,to.id),rev=from.id>to.id,d=(rev?1-k:k)*g.total;
  let i=1;while(i<g.pts.length-1&&g.cum[i]!<d)i++;
  const A=g.pts[i-1]!,B=g.pts[i]!,seg=(g.cum[i]!-g.cum[i-1]!)||1,u=Math.max(0,Math.min(1,(d-g.cum[i-1]!)/seg));
  const len=Math.hypot(B.x-A.x,B.y-A.y)||1,sign=rev?-1:1;
  return {x:A.x+(B.x-A.x)*u,y:A.y+(B.y-A.y)*u,f:[sign*(B.x-A.x)/len,sign*(B.y-A.y)/len]};
}
// Stations are drawn as platform-length pills laid along the track (≈180 m), like Kakao Map:
// a dot when zoomed out, a platform when zoomed in, so a stopped train visibly sits "in" it.
const PLATFORM_HALF=90;
function metresBetween(a:readonly number[],b:readonly number[]){return Math.hypot((b[0]!-a[0]!)*Math.cos(a[1]!*Math.PI/180),b[1]!-a[1]!)*111320}
// First `dist` metres of the track from station s toward neighbour n, starting at s.
function trackFrom(line:string,s:MapStation,n:MapStation,dist:number){
  const c=cityCoords(line,Math.min(s.id,n.id),Math.max(s.id,n.id)),pts=s.id<n.id?c:[...c].reverse(),out:LngLat[]=[pts[0]!];   // 승강장도 선택한 노선 경로를 따라가요.
  let left=dist;
  for(let i=1;i<pts.length&&left>0;i++){const d=metresBetween(pts[i-1]!,pts[i]!);if(d>=left){const u=left/d;out.push([pts[i-1]![0]+(pts[i]![0]-pts[i-1]![0])*u,pts[i-1]![1]+(pts[i]![1]-pts[i-1]![1])*u]);left=0}else{out.push(pts[i]!);left-=d}}
  return out;
}
function neighbours(line:string,s:MapStation):{prev?:MapStation|undefined;next?:MapStation|undefined}{for(const ids of paths[line]||[]){const i=ids.indexOf(s.id);if(i>=0)return {prev:byId.get(ids[i-1]!),next:byId.get(ids[i+1]!)}}return {}}
function platformNeighbours(line:string,s:MapStation){
  const result=neighbours(line,s);
  // 지선이 여러 chunk에 나뉜 역도 실제 인접 역을 찾아요.
  for(const ids of paths[line]||[]){const i=ids.indexOf(s.id);if(i<0)continue;const p=byId.get(ids[i-1]!),n=byId.get(ids[i+1]!);if(!result.prev&&p&&p!==result.next)result.prev=p;if(!result.next&&n&&n!==result.prev)result.next=n}
  return result;
}
// 그 역을 지나는 선로 한 줄: 앞 역 쪽 reach m + 뒤 역 쪽 reach m (여정의 역 안 걷기가 따라간다)
function stationTrack(line:string,s:MapStation,reach:number):LngLat[]{
  const {prev,next}=platformNeighbours(line,s),here=stopPos(line,s);
  const back=prev?trackFrom(line,s,prev,reach).reverse():[here],ahead=next?trackFrom(line,s,next,reach):[here];
  return [...back,...ahead.slice(1)];
}
const STATION_WIDTH_STOPS:[number,number][]=[[8,6],[12,11],[14,16],[16,24],[18,28]];   // [zoom, outline width px]
const stationWidthPx=(z:number)=>{const S=STATION_WIDTH_STOPS;if(z<=S[0]![0])return S[0]![1];for(let i=1;i<S.length;i++)if(z<=S[i]![0]){const [z0,w0]=S[i-1]!,[z1,w1]=S[i]!;return w0+(w1-w0)*(z-z0)/(z1-z0)}return S[S.length-1]![1]};
const stationRects=new Map<string,Rect>(),PLATFORM_SCALE=.3;   // platform bars: a third of the old outline width (names sit beside them now)
const platformPx=(r:StationRect&{widthM?:number},base:number)=>{if(!r.widthM)return base;const lat=r.coords[0]![1]*Math.PI/180,mpp=40075016.686*Math.cos(lat)/(512*2**map.getZoom());return Math.max(base,Math.min(base*2,r.widthM/mpp))};
function buildStationFeatures(){
  const {platform,kind}=modeCtl.settings().track,ribbon=platform==='ribbon',ground=kind==='ground';   // ribbon: 노선을 따라 휘는 띠(모든 모드), straight: 곧은 상자
  return stations.flatMap(s=>s.lines.map((x):GeoJSON.Feature<GeoJSON.LineString>=>{
    const line=x.name,{prev,next}=neighbours(line,s);
    const back=prev?trackFrom(line,s,prev,PLATFORM_HALF).reverse():[stopPos(line,s)],ahead=next?trackFrom(line,s,next,PLATFORM_HALF):[stopPos(line,s)];
    if(ribbon){
      const {prev,next}=platformNeighbours(line,s);
      const half=platformHalf[`${line}:${s.id}`]||PLATFORM_HALF;
      // 땅 위(기본): 공유 선로 칸을 넣은 열차 경로. 고가 · 롤코: 상판 중심선(cityCoords) — 칸은 상판처럼 px offset 으로 벌린다
      const from=(n:MapStation)=>{const lo=Math.min(s.id,n.id),hi=Math.max(s.id,n.id),t=ground?basicTrack(line,lo,hi).train:cityCoords(line,lo,hi);return s.id<n.id?t:[...t].reverse()};
      const incoming=prev?from(prev):null,outgoing=next?from(next):null;
      const bk=incoming?(trackStart(incoming,half) as LngLat[]).reverse():outgoing?[extendStart(outgoing,half) as LngLat,outgoing[0]!]:[stopPos(line,s)];
      const ah=outgoing?trackStart(outgoing,half) as LngLat[]:incoming?[incoming[0]!,extendStart(incoming,half) as LngLat]:[stopPos(line,s)];
      const coords=[...bk,...(metresBetween(bk.at(-1)!,ah[0]!)<.01?ah.slice(1):ah)],center=(outgoing||incoming)?.[0]||stopPos(line,s);
      const ref:[MapStation,MapStation]|null=next?[s,next]:prev?[prev,s]:null,offset=ground||!ref?0:edgeOffset(line,ref[0].id,ref[1].id)*(ref[0].id<ref[1].id?1:-1);   // 곧은 상자와 같은 칸(prev→next 오른쪽)
      stationRects.set(`${line}:${s.id}`,{coords,center,offset,widthM:stopWidth[`${line}:${s.id}`]||0,plat:1,half,reach:stopReach[`${line}:${s.id}`]||null});   // reach: 그쪽 끝에서 출구까지 늘린 통로 끝
      return {type:'Feature',properties:{id:s.id,name:s.name,line,lines:s.lines.map(y=>y.name).join('|'),color:colors[line],transfer:s.lines.length>1?1:0,offset},geometry:{type:'LineString',coordinates:coords}};
    }
    // A straight platform laid on the straight line that best fits the track through the station
    // (least squares), so the track runs through its middle. Where the track bends inside the
    // platform length, the rectangle is shortened (down to 60 m) until the track stays within
    // 6 m of its centre line — a clean rectangle on the straight part instead of a bent copy.
    const c=stopPos(line,s),kx=Math.cos(c[1]*Math.PI/180),M=111320;
    const fit=(half:number)=>{
      const bk=prev?trackFrom(line,s,prev,half).reverse():[c],ah=next?trackFrom(line,s,next,half):[c],raw=[...bk,...ah.slice(1)],pts:LngLat[]=[];
      for(let i=0;i<raw.length;i++){pts.push(raw[i]!);if(i<raw.length-1){const a=raw[i]!,b=raw[i+1]!,n=Math.ceil(metresBetween(a,b)/5);for(let k=1;k<n;k++)pts.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n])}}
      const xy=pts.map((p):LngLat=>[(p[0]-c[0])*kx*M,(p[1]-c[1])*M]),mx=xy.reduce((t,p)=>t+p[0],0)/xy.length,my=xy.reduce((t,p)=>t+p[1],0)/xy.length;
      let sxx=0,syy=0,sxy=0;for(const [x,y] of xy){sxx+=(x-mx)**2;syy+=(y-my)**2;sxy+=(x-mx)*(y-my)}
      const th=.5*Math.atan2(2*sxy,sxx-syy);let dx=Math.cos(th),dy=Math.sin(th);
      if(xy.length<2||!isFinite(th)){dx=1;dy=0}
      const e0=xy[0]!,e1=xy[xy.length-1]!;if(((e1[0]-e0[0])*dx+(e1[1]-e0[1])*dy)<0){dx=-dx;dy=-dy}   // keep prev→next orientation
      const dev=Math.max(0,...xy.map(([x,y])=>Math.abs(-(x-mx)*dy+(y-my)*dx)));
      const t0=-mx*dx-my*dy;return {dx,dy,cx:mx+dx*t0,cy:my+dy*t0,dev};   // centre: the stop's foot on the fitted line
    };
    let h=stopHalf[`${line}:${s.id}`]||PLATFORM_HALF,f:{dx:number;dy:number;cx:number;cy:number;dev?:number};   // half length from the exits' spread, when known
    const sm=(snapStops as Record<string,number[]|undefined>)[`${line}:${s.id}`],sd=sm?.length!>3?[sm![2]!,sm![3]!]:stopDirs[`${line}:${s.id}`];   // 곧은 승강장으로 옮긴 역은 그 도로 방향
    if(sd){   // built along the station's street; the route line is threaded to its two ends
      let [ex,ey]=sd as LngLat;const t=next||prev;
      if(t){const tx=(t.lon-c[0])*kx*M,ty=(t.lat-c[1])*M,sg=next?1:-1;if((ex*tx+ey*ty)*sg<0){ex=-ex;ey=-ey}}
      f={dx:ex,dy:ey,cx:0,cy:0};
    }else{f=fit(h);while(f.dev!>6&&h>30){h-=10;f=fit(h)}}
    const {dx,dy,cx:cxm,cy:cym}=f;
    const toLL=(x:number,y:number):LngLat=>[c[0]+x/(kx*M),c[1]+y/M],coords=[toLL(cxm-dx*h,cym-dy*h),toLL(cxm+dx*h,cym+dy*h)];
    // The pill runs prev→next; put it on the same parallel track as the adjoining route line.
    const ref:[MapStation,MapStation]|null=next?[s,next]:prev?[prev,s]:null,offset=ref?edgeOffset(line,ref[0].id,ref[1].id)*(ref[0].id<ref[1].id?1:-1):0;
    // plat: platform share of the station length (the rest is passages out to the exits)
    const ph=platformHalf[`${line}:${s.id}`];
    stationRects.set(`${line}:${s.id}`,{coords,offset,widthM:stopWidth[`${line}:${s.id}`]||0,plat:ph?Math.min(1,ph/h):1});   // widthM: metres across, from the exits
    return {type:'Feature',properties:{id:s.id,name:s.name,line,lines:s.lines.map(y=>y.name).join('|'),color:colors[line],transfer:s.lines.length>1?1:0,offset},geometry:{type:'LineString',coordinates:coords}};
  }));
}

const shapesReady=fetch(serverUrl('./track_shapes.json'),{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then((d:TrackShapes|null)=>{d=d||{};shapes=d.edges||(d.stops?{}:d as unknown as Record<string,LngLat[]>);stops=d.stops||{};stopDirs=d.stopDirs||{};stopHalf=d.stopHalf||{};platformHalf=d.platformHalf||{};stopWidth=d.stopWidth||{};stopReach=d.stopReach||{};smoothCache.clear();basicRouteCache.clear();stationRects.clear();edgeGeom.clear();coasterMotion.clear();coasterGeo.reset();stopMerc.clear();if(Object.keys(shapes).length)document.querySelector('.provenance')?.insertAdjacentHTML('beforeend',' 선로 형태는 © OpenStreetMap contributors 자료를 사용했습니다.');planner.rebuild()}).catch(()=>{});
// Phones (touch devices): render at most 2× device pixels and raise 3D buildings from zoom 15.
const PHONE=matchMedia('(max-width:720px),(pointer:coarse)').matches;
// 롤코 1인칭 발열(덕배 2026-10-17): 휴대폰은 탈 때만 그리는 배율 1.5(점 수 약 44 % 줄임). 비교: 주소에 #ridepx=2(배율 그대로).
// (탄 열차가 역에 서 있을 때는 이미 거의 안 그린다 — 맥 측정 0 fps — 그래서 따로 묶지 않는다)
const RIDE_PX=(m=>m?+m[1]!:PHONE?1.5:0)(location.hash.match(/ridepx=([\d.]+)/));
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)');
// Animation redraws (trains, my-location pulse) are capped: each one redraws the whole 3D map,
// and at the display's 60–120 Hz that kept phones hot. Panning and zooming still render at full rate.
// One timer for all of them; animFrame hooks update animated paint just before the redraw.
// Trains, the selected-train ripple and the my-location pulse are drawn on their own canvas over
// the map (drawTrains), at TRAIN_FPS while something there moves: a map redraw (3D buildings and
// all) is only needed when the camera moves, and following a train moves it at FOLLOW_FPS.
const TRAIN_FPS=30,FOLLOW_FPS=30,SAVER_FPS=15,animFrame:(()=>void)[]=[];let trainTimer=0,trainAt=0,drawTrains=()=>{},myLocation:[number,number]|null=null;
// 절전(설정 창 버튼, 이 기기에 저장): 움직임을 SAVER_FPS 로 — 30 fps 를 부르는 곳은 그대로 두고 예약 간격만 늘린다(이름표 · 따라가기 · 버스도 이 값)
// (타이머 뒤 requestAnimationFrame 이 화면 한 번을 더 기다려 60 Hz 화면의 '30'은 실제 약 20번이다 — 맥 측정 2026-10-26: 20 으로 두니 18번, 거의 그대로. 15 → 실제 약 13~15번)
let saverOn=false;const frameMs=()=>1000/(saverOn?SAVER_FPS:TRAIN_FPS);
// 다시 그린 횟수(쌓임): 열차 층 프레임 · 이름표 · 이름표 조회 · 지도 프레임 — 발열 · 배터리 점검(2026-10-23 덕배)이 1초에 몇 번인지 잰다(__subwayWebGL.frames)
const frameStats={trains:0,signs:0,signQueries:0,mapRenders:0};
function trainFrameSoon(ms:number){if(document.hidden)return;if(saverOn&&ms>0&&ms<1000/SAVER_FPS)ms=1000/SAVER_FPS;const at=performance.now()+ms;   // 탭이 숨겨지면 예약하지 않는다(다시 보이면 visibilitychange 가 깨운다)
  if(trainTimer&&trainAt<=at)return;clearTimeout(trainTimer);trainAt=at;trainTimer=setTimeout(()=>{trainTimer=0;requestAnimationFrame(()=>{if(!map.isMoving())drawTrains()})},ms)}   // while the map moves it draws them with each of its frames: a timer frame there used a newer camera than the map under it (tall rides slid and snapped back)
document.addEventListener('visibilitychange',()=>{if(!document.hidden)trainFrameSoon(0)});   // 다시 보이면 한 번 깨운다(숨긴 동안 멈춘 움직임이 이어 간다)
let repaintTimer=0,repaintAt=0;   // coaster: keep map repaint scheduling outside the train timer's comment
function repaintSoon(ms:number){const at=performance.now()+ms;if(repaintTimer&&repaintAt<=at)return;clearTimeout(repaintTimer);repaintAt=at;repaintTimer=setTimeout(()=>{repaintTimer=0;for(const f of animFrame)f();map.triggerRepaint()},ms)}
const map:MapLibre=new maplibregl.Map({container:'map',pixelRatio:Math.min(devicePixelRatio||1,PHONE?2:3),localIdeographFontFamily:'"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',...HOME,pitch:35,bearing:0,maxZoom:20,minZoom:7,zoomLevelsToOverscale:undefined,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf2f1'}}]},attributionControl:false,canvasContextAttributes:{antialias:!location.hash.includes('noaa')}});   // 모서리 계단 현상: 지도 캔버스도 MSAA(기본 꺼짐 — 1인칭에서 건물 · 고가 모서리가 깨지고 움직이면 반짝였다, 2026-10-06 덕배). #noaa: 끄고 비교(끊김 원인 찾기)   // 줌 20까지: zoomLevelsToOverscale(기본 4)을 끈다 — 켜 두면 줌 상한 20에서 바탕 타일을 z16 조각으로 잘라 받아 z14 타일만 쓰는 건물 · 버스 도로가 비었다(2026-10-09)
const BASE_PR=map.getPixelRatio(),BASE_FOV=map.getVerticalFieldOfView();   // 지도 캔버스 픽셀 비율 · 시야각(레트로일 때만 바꾼다 — syncPixels)
let busLayer:ReturnType<typeof createBusLayer>|null=null;   // bus: owns its loading, viewport culling and animation lifecycle
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
// My location (no station popup opens by itself; tap a station for its trains).
const me=createMyMotion();   // 내 위치 캐릭터의 걷기 · 서기 · 미끄러지듯 옮기기(위치마다 fix, 그릴 때 at)
const geolocate=new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true,maximumAge:2000},trackUserLocation:true,showAccuracyCircle:false,fitBoundsOptions:{maxZoom:16}});
map.addControl(geolocate,'top-right');   // under +/−; alone on phones, where +/− are hidden   // 정확한 위치로 자주: 내 위치 캐릭터가 걷는지 알려면(배터리를 조금 더 쓴다, 2026-10-22 행님)
let autoLocating=false,lastFix:GeolocationCoordinates|null=null;
// 위치가 켜진 채(저절로 켜진 경우 포함) 버튼을 누르면 MapLibre 는 끈다 — 끄지 않고 내 위치로 지도를 옮긴다.
// 켜지는 중이면 그대로 기다린다. 오류 상태 · 지도를 움직여 둔 상태(background)는 라이브러리 그대로.
const geolocateButton=map.getContainer().querySelector('.maplibregl-ctrl-geolocate');
geolocateButton?.addEventListener('click',ev=>{const cls=geolocateButton.classList;
  if(!cls.contains('maplibregl-ctrl-geolocate-active')||cls.contains('maplibregl-ctrl-geolocate-active-error'))return;
  ev.stopImmediatePropagation();if(cls.contains('maplibregl-ctrl-geolocate-waiting')||!lastFix)return;
  map.fitBounds(maplibregl.LngLatBounds.fromLngLat(new maplibregl.LngLat(lastFix.longitude,lastFix.latitude),lastFix.accuracy),{maxZoom:16,bearing:map.getBearing()},{geolocateSource:true});   // 라이브러리가 위치를 받을 때 옮기는 것과 같게
},true);
geolocate.on('error',e=>{if(autoLocating){autoLocating=false;return}if(myLocation&&e.code!==1)return;   // 이미 위치를 받는 중의 일시 오류(정확한 위치로 계속 받으면 가끔 난다)는 알리지 않는다 — 권한 거부만
  updateLiveNotice('위치를 가져오지 못했어요. 브라우저의 위치 권한을 확인해 주세요.')});
// First visit: fly to where the viewer is (inside the 수도권 only; elsewhere, or without permission,
// keep the whole-network view). Asks once for location; after that the browser remembers the answer.
const METRO_AREA:[number,number,number,number]=[126.3,36.8,127.9,38.3];
map.once('load',()=>{
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{
    const {longitude:x,latitude:y}=pos.coords,[w,s,e,n]=METRO_AREA;
    if(x<w||x>e||y<s||y>n)return;
    autoLocating=true;geolocate.trigger();   // same as pressing the button: blue dot, zoom 16
  },()=>{},{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
});
geolocate.on('geolocate',e=>{
  autoLocating=false;lastFix=e.coords;me.fix(e);
});
let selected='all',trainsEnabled=true,ready=false,pendingLine:string|null=null;
const $=(id:string)=>document.getElementById(id)!;
const liveState=document.querySelector<HTMLElement>('#liveState span');   // the line filter panel is gone: every line is always shown

// ---- live train routing -------------------------------------------------------------
// 열차 예측(trains/plan.mjs): plans · 시계 · 시간표와 학습 자료의 주인. 본체는 planner.plans 로 읽는다
const planner=createTrainPlanner({stations,stationByLine,key,normStatus,route,merc,realGeom,geom,trainPose,mercStop,catchup,catchupAt,
  predictStops:()=>modeCtl.settings().trains.predictStops,isRide:()=>rider.ride,getTrains:()=>feed.trains});
const {age,clock}=planner;
// Station exits (OSM subway_entrance, built by pipeline/build_entrances.py): {station id: [[lon,lat,ref,wheelchair]]}
let exits:Record<string,Exit[]>={};const exitCol=new Map<string,number[]>();   // exit "lon,lat" → the colour of the line its passage joins
const EXIT_MINZOOM=16,EXIT_MAX_M=350;   // exits (and their passages) from this zoom; farther than this from every platform: no passage
const EXIT_PASSAGES=false;   // 2026-10-05: 승강장 → 출구 통로 선은 그리지 않는다(출구 번호를 이어지는 노선색으로 칠해 대신함)
const exitsReady=fetch(serverUrl('./exits.json'),{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then((d:Record<string,Exit[]>|null)=>{exits=d||{}}).catch(()=>{});
function exitFeatures(){return Object.entries(exits).flatMap(([id,list])=>list.map(([lon,lat,ref,wc]):GeoJSON.Feature<GeoJSON.Point>=>({type:'Feature',properties:{ref,wc:wc??-1,station:+id},geometry:{type:'Point',coordinates:[lon,lat]}})))}
const smooth=(x:number)=>x*x*(3-2*x);
// 롤러코스터 (settings): between stations the lines rise off the ground like a coaster track and the
// trains ride on it; its clock can run faster (×modeCtl.speed): the trains then run ahead of the feed
// (warp s), a show rather than where they are. Flat at each platform, a climb, then hills of ~380 m,
// each its own height (COASTER_LOW..COASTER_H) and spacing.
// 모드 상태(web/modes/transition.mjs): 지금 · 원하는 모드, 마지막 요청 번호, 롤코 배속 · 앞서 달린 시간의 주인. 본체는 모드 이름 대신 지금 모드 설정(modeCtl.settings())을 묻는다 — modeOn 은 점검 창구(window.__subwayWebGL)의 simcity · joseon · coaster 용
// (심시티 모드: the miniature city — the coaster mode keeps its rides on the same city; 조선 모드: 심시티 (modeOn.simcity stays true: the viaduct,
// the trains on it, the x-ray) in the Joseon pack — 흙바닥, 기와집). 전환은 아래 '모드 전환'(prepareMode · commitMode).
// 앱 지도 모드(주소 #app — 슝 앱의 웹뷰): 웹 메뉴 · 아래 시트 · 정보창은 숨기고(syung.css html[data-app=map]) 역 · 열차 누름은 앱에 알린다, 앱은 경로 · 역 · 모드를 보낸다(ui/app_bridge.mts).
// 일반 웹(#app 없음)에서는 다리를 만들지 않는다 — 메시지를 받지도 보내지도 않는다
const appBridge=appMapMode()?createAppBridge({facts:{hasStation:id=>byId.has(id),hasLine:line=>line in paths,hasMode:id=>modes.has(id)},targets:{window,document}}):null;
// 다리 v2(앱 지도 모드): 앱 시트 높이(setPadding — 시트 따라가기 · 맞추기가 웹 시트 대신 이 값) · 줌 · 실시간 글(status) · 따라가는 것(followChanged)
let appPad=0;
function appStatus(){if(appBridge)appBridge.status({zoom:map.getZoom(),live:{state:liveState!.parentElement!.dataset.state??'idle',text:liveState!.textContent??''}})}
function appFollow(){appBridge?.followChanged(sheetUI.following??sheetUI.followBus??null)}
const modeCtl=createModeController({registry:modes,clock:()=>clock(),prepare:id=>prepareMode(id),onRequest:(want,now)=>{showModeButtons(want);modeBusy.request(want,now)},onFail:now=>{showModeButtons(now);modeBusy.end();appBridge?.modeChanged(now)},
  commit:(prev,next,o)=>{commitMode(prev,next,o);modeBusy.committed(next);appBridge?.modeChanged(next);if(location.hash.includes('debug'))console.info('[mode]',prev,'→',next,modes.explain(next))}}) as ModeCtl;   // #debug: 바꿀 때마다 최종 설정의 출처(키 → 적은 모드)
const modeOn=modeCtl.flags;
const cityPack=()=>modeCtl.settings().city.pack;   // the pack the ground, the buildings and their shadows read — 지금 모드 설정의 도시 팩(심시티 · 롤코 · 기본은 같은 참조)
// city-build: the miniature city's buildings (web/city/buildings.mjs): a custom layer under the station names (so names and
// labels stay readable over the city), and the same walls' depth for the train canvas; BuildingDepth and the map's own boxes
// stand down while a city mode is on. syncCity runs from applyTheme (mode, theme and the coaster's tower cut-off).
// 모드 코드: 심시티 · 조선 · 롤코에서만 쓰는 건물(city_buildings → city_mesh · city_hanok …) · 랜드마크 · 거북선 · 88열차 · 놀이기구는
// 첫 화면에서 받지 않는다 — 모드를 켤 때, 그리고 지도가 뜬 뒤 쉬는 틈에 받는다(2026-10-10 덕배: 첫 접속이 느리다, 첫 화면 JS 의 약 1/5).
// 모드는 이것이 다 온 뒤에야 켜진다(setSimcity · setCoaster 가 기다린다): 켜져 있으면 cityBuildings 등은 늘 있다
let CityBuildings!:typeof import('./city/buildings.mts').CityBuildings,CityLandmarks!:typeof import('./city/landmarks.mts').CityLandmarks,TurtleShips!:typeof import('./modes/joseon/turtle_ship.mts').TurtleShips,
  UnitConvoy!:typeof import('./modes/starcraft/convoy.mts').UnitConvoy,LifeUnits!:typeof import('./modes/starcraft/life_units.mts').LifeUnits,SkyUnits!:typeof import('./modes/starcraft/sky_units.mts').SkyUnits,
  CoasterTrain!:typeof import('./modes/coaster/train.mts').CoasterTrain,RideTrack!:typeof import('./modes/coaster/ride_track.mts').RideTrack,SLEEPER_M!:number,RideLayer!:typeof import('./modes/coaster/rides.mts').RideLayer,
  CoasterRidePlacement!:typeof import('./modes/coaster/ride_placement.mts').CoasterRidePlacement,sampleRideTracks!:typeof import('./modes/coaster/ride_placement.mts').sampleRideTracks,FestoonLayer!:typeof import('./modes/coaster/festoon.mts').FestoonLayer,
  NightBloom!:typeof import('./city/bloom.mts').NightBloom,PixelPalette!:typeof import('./city/pixel_palette.mts').PixelPalette,kitReady=false,kitLoad:Promise<void>|null=null;
let cityBuildings:import('./city/buildings.mts').CityBuildings|null=null,cityLandmarks:import('./city/landmarks.mts').CityLandmarks|null=null;const cityOn=()=>modeCtl.settings().city.enabled;
// 모드 코드가 다시 정적으로 부르는 모듈: 함께 바로 요청한다(안 그러면 city_buildings 를 다 받고 읽은 뒤에야 city_mesh 를 요청 — 맥 측정 1.8 s 차례 대기)
const MODE_KIT_DEPS=['city/mesh','modes/nations/models','city/sign_text','city/parts','city/geom','city/mvt','city/through_buildings','city/landmarks_data','modes/coaster/badges','modes/coaster/ride_sites','modes/starcraft/building_models'];   // (web/ 기준 경로)
function loadModeKit(){
  if(!kitLoad)for(const n of MODE_KIT_DEPS)import(`./${n}.mjs`).catch(()=>{});   // 미리 받기만: 실패는 아래 본 import 가 알린다
  return kitLoad??=Promise.all([import('./city/buildings.mts'),import('./city/landmarks.mts'),import('./modes/joseon/turtle_ship.mts'),import('./modes/coaster/train.mts'),import('./modes/coaster/ride_track.mts'),import('./modes/coaster/rides.mts'),import('./modes/coaster/ride_placement.mts'),import('./modes/joseon/hanok.mts'),import('./modes/coaster/festoon.mts'),import('./city/bloom.mts'),import('./modes/starcraft/convoy.mts'),import('./modes/starcraft/race_buildings.mts'),import('./city/pixel_palette.mts'),import('./modes/nations/parts.mts'),import('./modes/starcraft/life_units.mts'),import('./modes/starcraft/sky_units.mts')])   // (city_hanok: 도시 부품 'hanok' 등록 — 건물을 짓기 전에) · 롤코 밤 축제 전구
    .then(([b,l,t,c,r,p,q,,f,nb,sc,,pp,,lu,sk])=>{({UnitConvoy}=sc);({PixelPalette}=pp);({LifeUnits}=lu);({SkyUnits}=sk);({FestoonLayer}=f);({NightBloom}=nb);({CityBuildings}=b);({CityLandmarks}=l);({TurtleShips}=t);({CoasterTrain}=c);({RideTrack,SLEEPER_M}=r);({RideLayer}=p);({CoasterRidePlacement,sampleRideTracks}=q);
      cityBuildings=new CityBuildings({phone:PHONE});cityLandmarks=new CityLandmarks();kitReady=true;map.triggerRepaint()})
    .catch(e=>{kitLoad=null;console.warn('mode kit: failed to load',e);throw e})}
// city-build: 심시티 x-ray — the station platforms and running trains near the view, as boxes in mercator for cityBuildings: the
// buildings hiding them turn to glass there (pack.xray). Platforms: the station rect at its viaduct level; trains: tail to head on the deck
function cityXrayTargets(){
  const X=cityBuildings!.P.xray;if(!X||!X.on)return null;
  const b=map.getBounds(),A=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),B=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),m=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()).meterInMercatorCoordinateUnits();
  const zoom=map.getZoom(),unit=1/(512*2**zoom),pad=(B.x-A.x)*.3,inV=(x:number,y:number)=>x>A.x-pad&&x<B.x+pad&&y>B.y-pad&&y<A.y+pad,out=[];
  for(const [k,r] of stationRects){const c=r.coords,i=k.lastIndexOf(':'),line=k.slice(0,i),id=+k.slice(i+1);
    const P=maplibregl.MercatorCoordinate.fromLngLat(c[0]!),Q=maplibregl.MercatorCoordinate.fromLngLat(c[c.length-1]!),cx=(P.x+Q.x)/2,cy=(P.y+Q.y)/2;if(!inV(cx,cy))continue;
    const h=cityViaduct.stationH(line,id)*m,box={z0:h-X.platformBelowM*m,z1:h+X.platformAboveM*m,w:(Math.max(r.widthM||0,10)/2+X.platformMarginM)*m+Math.abs(r.offset||0)*unit,m};
    if(r.center&&c.length>2){   // 리본(선로 따라 휜 승강장): 호를 고르게 pieceM 이하 조각으로 — 건물 층이 조각을 다시 자르지 않게(곧은 막대와 같은 조각 수)
      const M=c.map(q=>maplibregl.MercatorCoordinate.fromLngLat(q)),cum=[0];for(let j=1;j<M.length;j++)cum.push(cum[j-1]!+Math.hypot(M[j]!.x-M[j-1]!.x,M[j]!.y-M[j-1]!.y));
      const total=cum.at(-1)!,n=Math.max(1,Math.ceil(total/((X.pieceM||30)*m*.98)));let j=1;
      const at=(s:number):[number,number]=>{while(j<M.length-1&&cum[j]!<s)j++;const A=M[j-1]!,B=M[j]!,u=Math.max(0,Math.min(1,(s-cum[j-1]!)/((cum[j]!-cum[j-1]!)||1)));return [A.x+(B.x-A.x)*u,A.y+(B.y-A.y)*u]};
      let a=at(0);for(let i=1;i<=n;i++){const b=at(total*i/n);out.push({id:'s'+k+':'+i,ax:a[0],ay:a[1],bx:b[0],by:b[1],...box});a=b}
      continue}
    const dx=Q.x-P.x,dy=Q.y-P.y,d=Math.hypot(dx,dy)||1e-12,L=Math.max(20*m,d*Math.max(.1,Math.min(1,r.plat||1)))/2;
    out.push({id:'s'+k,ax:cx-dx/d*L,ay:cy-dy/d*L,bx:cx+dx/d*L,by:cy+dy/d*L,...box})}
  if(X.trains&&trainsEnabled){const bodyPx=trainBodyPx(zoom),lane=cityViaduct.train(zoom,bodyPx).lanePx;
    for(const plan of planner.plans){const pose=trainPose(plan);if(!journeyMap.trainShown(plan,pose.dist))continue;const q=trackPoint(plan,pose.dist);if(!inV(q.x,q.y))continue;   // 길찾기에 숨긴 열차는 건물 뒤 비침도 없다
      const half=Math.max(plan.cars*plan.carMetres*m,TRAIN_MIN_PX*unit)/2,a=trackPoint(plan,pose.dist-half),e=trackPoint(plan,pose.dist+half);
      out.push({id:'t'+plan.id,ax:a.x,ay:a.y,bx:e.x,by:e.y,z0:q.h-X.trainBelowM*m,z1:q.h+X.trainAboveM*m,w:X.trainHalfWidthM*m+(Math.abs(q.off||0)+lane+bodyPx)*unit,m})}}
  return out}
// 켬 · 끔: 설정 창 버튼(이 기기에 저장) — 처음 읽을 때 주소 #prebuild · #noprebuild 가 먼저, 아무것도 없으면 휴대폰 끔 · 컴퓨터 켬
// (덕배 2026-10-12: 몇 분 쓰니 손가락이 뜨거울 만큼 발열 — 원인 확정 전, 버튼으로 껐다 켰다 비교)
let prebuildOn=null;
const prebuildWant=()=>prebuildOn??=/(^|[^o])prebuild/.test(location.hash)?true:location.hash.includes('noprebuild')?false:(v=>v?v==='on':!PHONE)(prefs.get('prebuild'));
function prebuildCity(){if(prebuildWant()&&cityBuildings&&!cityOn()&&!document.hidden&&cityBuildings.P.pack===modes.settings('simcity').city.pack)cityBuildings.prebuild(map)}   // (기본 모드 팩 = 심시티 팩: 다르면 짓지 않는다)
function syncCity(){if(!ready||!cityBuildings)return;if(cityOn()&&!map.getLayer('city-buildings'))map.addLayer(cityBuildings,map.getLayer('station-names')?'station-names':undefined);
  cityBuildings.set({on:cityOn(),tone:modeCtl.settings().city.tone,theme:effectiveTheme(),pack:cityPack(),night:{lights:nightNow().lights}});
  syncNightBloom();
}
// 도시 모드 밤 빛(팩 night — web/modes/basic/city.mts): ① 불빛 다시 맞추기(lights) ② 빛 번짐(bloom, 휴대폰은 팩 night.bloom.phone 일 때만) ③ 바닥 빛(ground).
// 다크 테마 · 도시 모드에서만 켜진다. nightLook 은 점검 창구(window.__subwayWebGL.setNightLook)로 하나씩 끄고 켜는 스위치(시안 비교) — 평소엔 다 켬
const nightLook={lights:true,bloom:true,ground:true,bloomTune:null as NightPack['bloom']};   // bloomTune: 점검용 번짐 값 덮어쓰기({strength, threshold …})
function nightNow(){const N=cityPack()?.night,on=!!N&&cityOn()&&effectiveTheme()==='dark';return {lights:on&&nightLook.lights&&!!N.lights,ground:on&&nightLook.ground&&!!N.ground,bloom:on&&nightLook.bloom&&!!N.bloom&&(!PHONE||N.bloom.phone===true),N}}
// 지도 캔버스의 빛 번짐: 도시 건물(창 · 간판)과 바닥 빛 위, 역 이름표 · 글자 아래의 custom layer. 열차 캔버스는 overlay 가 따로 번지게 한다
const mapBloom:FxLayer<import('./city/bloom.mts').NightBloom>={id:'city-night-bloom',type:'custom',renderingMode:'2d',fx:null,
  onAdd(m,gl){this.gl=gl},onRemove(m,gl){this.fx?.dispose(gl as WebGL2RenderingContext);this.fx=null},
  render(gl){const n=nightNow();if(!n.bloom||!NightBloom)return;if(!this.fx){this.fx=new NightBloom();this.fx.init(gl)}const B={...n.N!.bloom,...nightLook.bloomTune};this.fx.render(gl,{strength:B.strength,threshold:B.threshold,knee:B.knee,levels:B.levels,tint:hexRgb01(B.tint||'#FFFFFF')})}};
const hexRgb01=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
function syncNightBloom(){if(!ready)return;const on=nightNow().bloom&&!!map.getLayer('city-buildings');
  if(on&&!map.getLayer('city-night-bloom'))map.addLayer(mapBloom,map.getLayer('station-names')?'station-names':undefined);else if(!on&&map.getLayer('city-night-bloom'))map.removeLayer('city-night-bloom')}   // 나가면 GL 을 치운다(onRemove)
function setNightLook(o:Partial<typeof nightLook>|null){Object.assign(nightLook,o||{});applyTheme();map.triggerRepaint();return {...nightLook}}
const cityViaduct=new CityViaduct({pack:CITY_STYLE as unknown as CityPack,net:{paths,colors,geom,offset:edgeOffset,bodyPx:z=>trainBodyPx(z),get byId(){return byId},get rects(){return stationRects},get exits(){return exits}}});   // city-life: 심시티 고가 — on the mode's track (geom: the real one, or a tunnel stretch moved onto its street), drawn in drawTrains; trackPoint lifts the trains onto it (heightAt: the stations' levels and the ramps between); exits: the stairs down to them
const coasterGeo=createCoasterGeometry({maplibregl,paths,byId,cityViaduct,edgeGeom,geom,cityGeom,withCum,metresBetween,smooth,onFresh:()=>{coasterMotion.clear();coasterTrack.stale=true}});   // 롤코 길 · 언덕 · 건물 높이(높이가 바뀌면 주행 시간 · 선로도 다시)
const {coasterPath,rolled,CORK_HEART,coasterProfile,coasterAt,coasterGaps,coasterRises,inversion,loopD,corkOf,loadCoasterBuildings}=coasterGeo;
const warpNow=()=>modeCtl.warpNow();   // 롤코 배속으로 앞서 달린 시간(s)
// Loops and corkscrews are landmarks, not the rule (on half the edges each they all looked alike): along each line, in
// order, an edge may take one (not both) once INV_GAP m have passed since the last — a loop by chance INV_LOOP, else a
// corkscrew by INV_CORK. Chosen once per edge, the first line through it deciding; 'loop', 'cork' or ''.
const coasterMotion=createCoasterMotion({geom,coasterAt,isCoaster:()=>modeCtl.settings().track.kind==='coaster'});const {ridePace,toRide,fromRide}=coasterMotion;   // 롤코 주행 속도 · 탄 거리
// Where the middle of the train is, as a distance (mercator units) along plan.seq: the feed's prediction (rawPose), but
// never into the train ahead on the same track. Two reports a moment apart put trains on top of each other (2호선 2083
// leaving 잠실나루 and 6085 coming in 2 s later, 2026-10-03; a train held at its next platform after fresh data meets the
// one standing there): the one behind waits TRAIN_GAP_M back, as at a signal. Same line, direction and express or not
// (an express passes a local at a station). Worked out for all the trains at once, at most every 10 ms.
const TRAIN_GAP_M=20,spaced=new Map<RuntimePlan,Pose>();let spacedAt=-1e9,spacedFor:RuntimePlan[]|null=null;
function trainPose(p:RuntimePlan):Pose{const now=clock(),plans=planner.plans;if((now===planner.frameClock?now!==spacedAt:now-spacedAt>10)||spacedFor!==plans){spaceTrains();spacedAt=now;spacedFor=plans}return spaced.get(p)||rawPose(p)}
function spaceTrains(){
  spaced.clear();const groups=new Map<string,Spaced[]>(),at=(e:Spaced)=>{const q=trackPoint(e.p,e.pose.dist);e.x=q.x;e.y=q.y;e.f=q.f};
  for(const p of planner.plans){const pose=rawPose(p);spaced.set(p,pose);if(p.seq.length<2)continue;
    const m=mercStop(p.t.line,p.seq[0]!).meterInMercatorCoordinateUnits(),k=`${p.t.line}|${p.t.direction}|${p.t.express?1:0}`,e={p,pose,half:p.cars*p.carMetres*m/2,m} as Spaced;at(e);
    if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(e)}
  for(const g of groups.values())if(g.length>1)for(let pass=0;pass<2;pass++)for(const a of g)for(const b of g){if(a===b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),need=a.half+b.half+TRAIN_GAP_M*a.m;if(d>=need)continue;
    const ahead=dx*(a.f[0]!+b.f[0]!)+dy*(a.f[1]!+b.f[1]!);if(ahead<0||ahead===0&&a.p.id<b.p.id)continue;   // b is not in front of a
    a.pose={...a.pose,dist:Math.max(0,a.pose.dist-(need-d))};at(a);spaced.set(a.p,a.pose)}
}
function rawPose(p:RuntimePlan):Pose{
  const S=modeCtl.settings();let el=age(p.t.receivedAt)+p.lead+(S.trains.timeWarp?warpNow():0),ph=p.phases[p.phases.length-1]!;
  for(const x of p.phases){if(el<x.dur){ph=x;break}el-=x.dur}
  const u=ph.dur===Infinity?1:Math.min(1,el/ph.dur),e=ph.ease==='both'||(ph.ease as unknown)===true?smooth(u):ph.ease==='in'?u*u:ph.ease==='out'?1-(1-u)*(1-u):u,k=S.track.kind==='coaster'&&ph.from!==ph.to?ridePace(p.t.line,ph.from.id,ph.to.id,ph.k0,ph.k1,e):ph.k0+(ph.k1-ph.k0)*e;
  const i=Math.max(0,p.seq.indexOf(ph.from)),len=(p.cum[i+1]??p.cum[i]!)-p.cum[i]!;
  const dist=p.cum[i]!+len*(ph.from===ph.to?0:k),moving=ph.k0!==ph.k1;
  // After fresh data (see replacePlans): never back up — wait where the train was drawn until the
  // new prediction passes it; a forward correction is run along the track instead of jumped.
  if(p.hold!=null){
    // ahead of fresh data: run on to the station it was heading for and wait at the platform there
    // (standing still between stations looked broken), then go on once the prediction catches up
    let at=p.hold,creeping=false;
    if(p.creep){const w=(clock()-p.creep.at)/p.creep.ms;if(w<1){at=p.creep.from+(p.hold-p.creep.from)*(p.creep.linear?w:1-(1-w)*(1-w));creeping=true}else p.creep=null}
    if(dist<p.hold)return dist>at?{dist,moving}:{dist:at,moving:creeping};   // 느리게 가는 중에 예측이 앞지르면 예측을 탄다(replacePlans CREEP_MPS)
    if(creeping&&at<dist&&!p.creep!.linear)p.glide={c:catchup((dist-at)/mercStop(p.t.line,p.seq[0]!).meterInMercatorCoordinateUnits()),at:clock()};
    p.hold=null;p.creep=null;
  }
  // 따라잡는 중: 예측보다 남은 차이(m)만큼 뒤에 그려요. 차이는 원래 주행 위에 더한 속도(상한 CATCHUP_MPS)로 줄어요.
  if(p.glide){const g=catchupAt(p.glide.c,(clock()-p.glide.at)/1000);if(!g.done)return {dist:Math.max(0,dist-g.left*mercStop(p.t.line,p.seq[0]!).meterInMercatorCoordinateUnits()),moving:true};p.glide=null}
  // stand: at a stop — s into it, how long it lasts and which station
  return {dist,moving,stand:!moving&&ph.dur!==Infinity?{t:el,dur:ph.dur,st:ph.k0===0?ph.from:ph.to}:null};
}
// Point on the track `dist` along plan.seq (clamped to its ends), with heading and lateral offset.
// Trains keep to the right of their travel direction (Korean right-hand running): looking along
// the 상행 direction, 상행 trains are right of the line and 하행 trains left of it.
function trackPoint(p:RuntimePlan,dist:number):TrackPt{
  const {seq,cum}=p,line=p.t.line,kind=modeCtl.settings().track.kind;
  if(seq.length<2&&kind==='ground'){
    const s=seq[0]!,{prev,next}=platformNeighbours(line,s),n=next||prev;
    if(n){const q=next?along(line,s,n,0):along(line,n,s,1);return {...q,r:[-q.f[1],q.f[0]],off:0,h:0,roll:0}}
  }
  if(seq.length<2){const m=mercStop(line,seq[0]!);return {x:m.x,y:m.y,f:[0,-1],r:[1,0],off:0,h:kind!=='ground'?cityViaduct.stationH(line,seq[0]!.id)*m.meterInMercatorCoordinateUnits():0}}   // city-life: 심시티 — on the viaduct, at this station's level
  const end=cum[cum.length-1]!,d=Math.max(0,Math.min(end,dist)),over=dist-d; // beyond either end: extend straight
  let i=0;while(i<seq.length-2&&cum[i+1]!<d)i++;
  const a=seq[i]!,b=seq[i+1]!,len=(cum[i+1]!-cum[i]!)||1;let k=(d-cum[i]!)/len,h=0,lat=0,roll=0;const fw=a.id<b.id?1:-1;
  if(kind==='coaster'){const lo=Math.min(a.id,b.id),hi=Math.max(a.id,b.id),g=geom(line,lo,hi),[sg,hh,la,ro]=coasterAt(line,lo,hi,(fw>0?k:1-k)*g.total),q=g.total?sg/g.total:0;h=hh;lat=la*fw;roll=ro*fw;k=fw>0?q:1-q}   // on the coaster: its ground point, height, and the corkscrew's swing and roll (the way it runs)
  const pt=along(line,a,b,k),f=pt.f,r:[number,number]=[-f[1],f[0]],x=pt.x+f[0]*over+r[0]*lat,y=pt.y+f[1]*over+r[1]*lat;
  // Shared-track slot changes at stations; ease it over ~60 m either side instead of jumping.
  const o=(j:number)=>edgeOffset(line,seq[j]!.id,seq[j+1]!.id)*(seq[j]!.id<seq[j+1]!.id?1:-1),B=60*(p.m??=mercStop(line,seq[0]!).meterInMercatorCoordinateUnits());
  let off=o(i);
  if(i>0&&d-cum[i]!<B)off+=(o(i-1)-off)*.5*(1-(d-cum[i]!)/B);
  else if(i<seq.length-2&&cum[i+1]!-d<B)off+=(o(i+1)-off)*.5*(1-(cum[i+1]!-d)/B);
  if(kind==='ground')off=0;   // 기본 화면 경로에 기존 공유 선로 간격이 들어 있어요.
  if(kind==='viaduct')h=cityViaduct.heightAt(line,a.id,b.id,k)*p.m;   // city-life: 심시티 — the trains run on the viaduct's deck: its rail height here (the station's level, or the ramp between two), in mercator units
  return {x,y,f,r,off,h,roll};
}
const lastPose=new Map<string,{x:number;y:number}>(),BLEND_MS=1200;

// Train body width and lane offset in screen px, shared by the train layer, roof numbers,
// destination tags and click picking.
// 가까이(z16→17) 볼 때는 화면 폭 대신 실제에 가까운 폭(TRAIN_CLOSE_M, 실제 약 3.1 m 의 1.5배)으로 줄여 간다 — 모든 모드 공통.
// 크게 그린 열차(z17 에서 13 m)가 출구 · 보도를 덮던 문제(중화 7호선, 2026-10-05). z16 이하는 그대로.
const TRAIN_CLOSE_M=4.6,TRAIN_CLOSE_ZOOM=[16,17],pxPerMetre=(z:number)=>512*2**z/(40075016.686*Math.cos(37.5*Math.PI/180));
const farBodyPx=(z:number)=>15+13*smooth(Math.max(0,Math.min(1,(z-13)/4)));
// z17 위로는 실제 폭 그대로 — 지도와 같이 커진다(2026-10-10 덕배: 줌 18 위에서 노선 폭이 바뀐다 — 멀리서의 폭 28 px 상한에
// 걸려 z18.5 부터 지도는 커지는데 열차 · 고가 · 수로는 28 px 에 멈춰 상대적으로 가늘어졌다)
const bodyWidthPx=(z:number)=>{const far=farBodyPx(z),k=smooth(Math.max(0,Math.min(1,(z-TRAIN_CLOSE_ZOOM[0]!)/(TRAIN_CLOSE_ZOOM[1]!-TRAIN_CLOSE_ZOOM[0]!))));
  return k<=0?far:far*(TRAIN_CLOSE_M*pxPerMetre(z)/far)**k},TRAIN_MIN_PX=36;   // min on-screen length when zoomed out; 줄어드는 구간은 비율로 이어서 매끄럽게
const laneOffsetPx=(z:number,body=bodyWidthPx(z))=>(1.5+2.5*Math.max(0,Math.min(1,(z-8)/7)))/2+3.5+body/2;
// on the coaster (always car by car) zoomed out: a slimmer body, so a 20 m car stays longer than wide (≥ 7 px across)
const coasterBodyPx=(z:number)=>Math.min(bodyWidthPx(z),Math.max(7,20*pxPerMetre(z)/1.6));
// 지금 모드의 열차 굵기(trains.body: wide · slim) — 그리기 · 클릭 · 고가 상판 · x-ray 가 같은 값을 쓴다
const trainBodyPx=(z:number)=>modeCtl.settings().trains.body==='slim'?coasterBodyPx(z):bodyWidthPx(z);
// 1인칭으로 탈 수 있는지: 공원이 켜져 있고 롤코 길 위(자리 고르기 버튼 · 타기 · 내린 뒤 정보창이 같은 조건)
const canRide=()=>{const S=modeCtl.settings();return S.park.enabled&&S.track.kind==='coaster'};
// 롤코 칸 하나의 틀(fr: 뒤 끝 바닥 가운데, F 앞, R 오른쪽, U 위)과 길이 L(px) — drawTrains 와 1인칭 카메라가 같은 식을 써요.
// P: 탄 거리 → 선로 위 점, tail: 맨 뒤 끝, car: 칸 하나 길이, j: 칸 번호(0 = 맨 뒤), gap: 칸 사이 틈
function coasterCarFrame(P:(d:number)=>FramePt,tail:number,car:number,j:number,n:number,unit:number,bodyPx:number,lanePx:number,gap:number){
  const A=P(tail+j*car+(j?gap/2:0)),B=P(tail+(j+1)*car-(j<n-1?gap/2:0));
  const oa=(A.off+lanePx)*unit,ob=(B.off+lanePx)*unit;A.x+=A.r[0]!*oa;A.y+=A.r[1]!*oa;B.x+=B.r[0]!*ob;B.y+=B.r[1]!*ob;   // each end on its own lane (one normal for both pulled the far end off it on curves)
  const dx=B.x-A.x,dy=B.y-A.y,dz=B.h-A.h,len=Math.hypot(dx,dy,dz);if(len<unit*.1)return null;
  const F=[dx/len,dy/len,dz/len] as [number,number,number],[R,U]=rolled(A.r,F,P(tail+(j+.5)*car).roll||0);   // turned over in a corkscrew, as at its middle (the ends' 2π and 0 averaged to π: upside down under the track)
  const [,U0]=rolled(A.r,F,0),hc=CORK_HEART*bodyPx*unit;   // turned about its own middle (the rails wind round the same line)
  return {fr:[A.x+(U0[0]-U[0])*hc,A.y+(U0[1]-U[1])*hc,A.h+(U0[2]-U[2])*hc,F[0],F[1],F[2],R[0],R[1],R[2],U[0],U[1],U[2]],L:len/unit};
}
// 1인칭 레일 · 침목의 틀: d0..d1(탄 길이, step 간격)마다 차선 가운데의 레일 중심과 틀 — 칸과 같은 식(coasterCarFrame), 코르크스크루에선 같은 축을 돈다
function coasterRailFrames(P:(d:number)=>FramePt,d0:number,d1:number,step:number,unit:number,bodyPx:number,lanePx:number,front=d0,m=1){   // (front · m: 열차 앞 끝의 탄 길이와 1 m — 틀마다 앞 끝에서의 거리 d m)   // (마지막 틀에 end: 레일이 다음 틀로 이어지지 않는다)
  const on=(d:number)=>{const q=P(d),o=(q.off+lanePx)*unit;q.x+=q.r[0]!*o;q.y+=q.r[1]!*o;return q},hc=CORK_HEART*bodyPx*unit,out:RailFrame[]=[];
  let A=on(d0);
  for(let d=d0;d<=d1+1e-12;d+=step){
    const B=on(d+step),dx=B.x-A.x,dy=B.y-A.y,dz=B.h-A.h,len=Math.hypot(dx,dy,dz);
    if(len>unit*.01){const F=[dx/len,dy/len,dz/len] as [number,number,number],[R,U]=rolled(A.r,F,A.roll||0),[,U0]=rolled(A.r,F,0);out.push({p:[A.x+(U0[0]-U[0])*hc,A.y+(U0[1]-U[1])*hc,A.h+(U0[2]-U[2])*hc],F,R,U,d:(d-front)/m})}
    A=B;
  }
  if(out.length)out[out.length-1]!.end=true;
  return out;
}
// 새 자료로 옮겨 그리는 중: 예전 자리에서 미끄러져 오는 양(메르카토르), 끝났으면 null
function blendShift(plan:RuntimePlan,mid:{x:number;y:number}):[number,number]|null{if(!plan.blend)return null;const w=(clock()-plan.blend.at)/BLEND_MS;if(w>=1){plan.blend=null;return null}const e=1-smooth(w);return [(plan.blend.x-mid.x)*e,(plan.blend.y-mid.y)*e]}
const destLabel=(t:LiveTrain)=>{const d=String(t.destination||'');return !d?'':/순환$/.test(d)?`${d.replace(/순환$/,'')} 방면(순환)`:`${d}행`};

// ---- train model --------------------------------------------------------------------
const hexRGB=(v:string)=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];

// ---- bottom sheet: station and train details slide up from the bottom of the map -------------
const sheetUI=createBottomSheet({map,maplibregl,planner,trackPoint,trainPose,laneOffsetPx,animFrame,FOLLOW_FPS,fitRoute:bottom=>fitRoute(bottom),
  live:{get frameMs(){return frameMs()},get journey(){return journey},get routeBounds(){return journeyMap.routeBounds},get busLayer(){return busLayer},get rider(){return rider},get stopRide(){return stopRide},get appPad(){return appBridge?appPad:null}}});   // 아래 시트 · 따라가기
const {sheet,sheetBody,followBtn,openSheetView,closeSheet,sheetBusy,sheetPad,trainLngLat,follow,followBusStart,followSoon}=sheetUI;
const journeyMap=createJourneyMap({map,maplibregl,colors,byId,cityCoords,stopPos,stationTrack,cityViaduct,sheetPad,journeyCasingPaint,journeyRidePaint,journeyStopPaint,
  live:{get busLayer(){return busLayer},get settings(){return modeCtl.settings()},get stationAlpha(){return stationAlpha},set stationAlpha(v){stationAlpha=v}}});   // 여정 지도 표시
const {rideCoords,showRoute,fitRoute,clearRoute,setSubwayOff,setRouteOpacity,focusRoute}=journeyMap;
// 승차권 경로 지도에서 보기(user/account — 늦게 받는다)와 길찾기 · 버스 노선은 지도의 여정 자리를 같이 쓴다: 한쪽이 그리면 다른 쪽 막대 · 길을 치운다(ticketRouteGone)
let ticketRouteGone:(()=>void)|null=null;
const journey=initJourney({openSheetView,drawJourney,clearJourney,closeSheet:()=>closeSheet(),map,colors,myLocation:()=>myLocation,button:document.getElementById('routeButton')!,showRoute:(...a)=>{ticketRouteGone?.();showRoute(...a);refreshLive()},clearRoute:()=>{ticketRouteGone?.();clearRoute();refreshLive()}});   // 길찾기 노선만 받기 · 다시 전부
document.getElementById('routeButton')!.addEventListener('click',()=>ticketRouteGone?.());   // 길찾기 시트를 열면 승차권 길은 지운다
const ticketRoute={show(plan:JourneyPlan,pad?:{bottom:number;right:number}){journey.drop();closeSheet();showRoute(plan,false,false);fitRoute(pad?.bottom??110,pad?.right);refreshLive()},clear(plan:JourneyPlan){if(journeyMap.displayedRoute?.plan===plan){clearRoute();refreshLive()}},onGone(fn:(()=>void)|null){ticketRouteGone=fn}};   // 맞춰 보기는 아래 막대 자리만큼 띄운다(길찾기 막대와 같은 110) · pad: 경로 고르기의 서랍 자리(휴대폰 아래 · 데스크톱 오른쪽)
// ---- 롤코 1인칭: 고른 자리에 앉아 열차를 타요 ----------------------------------------------------
// 열차 정보창의 배치도에서 칸 · 줄 · 좌우를 고르고 타면, 카메라가 그 자리 눈(coaster_first_person.mjs)에서 진행 방향을 보고
// 오르내림 · 루프 · 코르크스크루를 칸과 함께 돌아요. 카메라와 내 열차는 같은 순간의 자리(ride.snap)로 그려 서로 밀리지 않아요.
// 지도를 끌거나 확대하면 · '내리기' · Esc · 롤코 끄기로 내려서 타기 전 카메라로 돌아가요.
const rider=createCoasterRide({map,maplibregl,RIDE_PX,planner,colors,cityViaduct,sheetBody,closeSheet,showTrainPopup:plan=>showTrainPopup(plan),applyTheme,effectiveTheme,coasterBodyPx,TRAIN_MIN_PX,mercStop,trainPose,trackPoint,blendShift,toRide,fromRide,coasterCarFrame,coasterRailFrames,riderState:plan=>riderState(plan),trainLngLat,
  stopFollowing:()=>{sheetUI.easing=false;sheetUI.following=null},isCoaster:canRide,getSheetTrain:()=>sheetUI.sheetTrain,getSleeperM:()=>SLEEPER_M,onRide:state=>appBridge?.rideChanged(state)});
const {riding,rideRows,startRide,stopRide,rideFrame,rideBar}=rider;
animFrame.push(rideFrame);
// #fps: 실제 기기에서 지도 프레임 — 초당 프레임, 늦은 프레임(20 · 34 ms 넘게) 수, 가장 긴 간격, 지도 한 프레임 · 1인칭 카메라 JS 시간(ms). 서버 캡처로는 잴 수 없어서(2026-10-06 덕배)
if(location.hash.includes('fps')){const o=document.createElement('pre');o.style.cssText='position:fixed;z-index:99;left:4px;bottom:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#fff;border-radius:8px;pointer-events:none;white-space:pre';document.body.append(o);
  const iv:number[]=[],js:number[]=[],cam:number[]=[],r=(map as FpsMap)._render.bind(map);let last=0,shown=0;
  (map as FpsMap)._render=(...a)=>{const t=performance.now();if(last)iv.push(t-last);last=t;const x=r(...a);js.push(performance.now()-t);return x};
  animFrame[animFrame.indexOf(rideFrame)]=()=>{const t=performance.now();rideFrame();if(rider.ride)cam.push(performance.now()-t)};
  const ms=(a:number[])=>a.length?Math.max(...a).toFixed(0):'-',avg=(a:number[])=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):'-';
  let f0={...frameStats};   // 열차 층 · 이름표 · 이름표 조회 1초당(2026-10-23 덕배: 폰에서 발열 · 배터리 점검)
  setInterval(()=>{const now=performance.now(),s=now-shown;shown=now;const f1={...frameStats},per=(k:keyof typeof frameStats)=>((f1[k]-f0[k])*1000/s).toFixed(0);f0=f1;
    o.textContent=`${rider.ride?'탑승 중':'지도'} ${(iv.length*1000/s).toFixed(0)} fps · 늦은 프레임 ${iv.filter(x=>x>20).length} / ${iv.filter(x=>x>34).length} · 가장 긴 간격 ${ms(iv)} ms\n지도 JS 평균 ${avg(js)} · 최장 ${ms(js)} ms · 카메라 ${avg(cam)} / ${ms(cam)} ms · ${devicePixelRatio}x(그림 ${map.getPixelRatio()}x) ${innerWidth}×${innerHeight}${cityBuildings?(i=>`\n건물 지음 ${i.built}개 · 짓기 ${(i.buildMs/1000).toFixed(1)} s · 들고 있는 것 ${i.ready}타일 ${(i.bytes/1e6).toFixed(0)} MB · 미리 짓기 ${prebuildWant()?'켬':'끔'}`)(cityBuildings.info()):''}\n열차 층 ${per('trains')} · 이름표 ${per('signs')} · 이름표 조회 ${per('signQueries')} 번/초 · 절전 ${saverOn?'켬':'끔'}`;   // (짓기: Worker 에 맡긴 때부터 받을 때까지의 합 — 발열 비교용, 덕배 2026-10-12)
    iv.length=js.length=cam.length=0},1000)}
map.on('movestart',e=>{if(rider.ride&&e.originalEvent)stopRide(false)});   // 끌기 · 확대 · 돌리기: 사람이 카메라를 잡으면 내려요

const popups=createPopups({map,maplibregl,planner,colors,age,destLabel,trainPose,trackPoint,mercStop,TRAIN_MIN_PX,trainBodyPx,canRide,laneOffsetPx,cityViaduct,seatPickerHTML,seatLabel,rideRows,rider,openSheetView,follow,sheetUI,sheetBody,followBtn,
  live:{trainShown:(p,d)=>journeyMap.trainShown(p,d),get settings(){return modeCtl.settings()},get trainsEnabled(){return trainsEnabled},get subwayOff(){return journeyMap.subwayOff},get exits(){return exits},get feed(){return feed}}});   // 열차 · 역 정보창, 열차 고르기, 실시간 알림
const {trainState,riderState,trainNow,showTrainPopup,pickTrain,liveNotice,updateLiveNotice,arrivalText,arrivalRank,showStationPopup}=popups;
const openTrain=(plan:TrainPlan)=>{if(appBridge)appBridge.trainTap(plan);else showTrainPopup(plan)};   // 앱 지도 모드: 열차 시트 대신 앱에 알린다

// ---- station labels (DOM markers with box collision) --------------------------------
// Station names sit inside the platform rectangle, turned along it. Where the name is longer than
// the platform on screen, its box (same outline and fill) extends past it so the text still fits.
// They are drawn by a WebGL layer placed *below* the trains, so a train at a station stays visible.
const measure=(()=>{const c=document.createElement('canvas').getContext('2d')!,cache=new Map<string,number>();return (t:string,px:number)=>{const k=px.toFixed(1)+t;let w=cache.get(k);if(w==null){c.font=`700 ${px}px "Noto Sans KR",sans-serif`;w=c.measureText(t).width;cache.set(k,w)}return w}})();
// Screen-space placement of every visible name box (collision-culled), recomputed each frame.
const hexRGB3=(v:string)=>[parseInt(v.slice(1,3),16)/255,parseInt(v.slice(3,5),16)/255,parseInt(v.slice(5,7),16)/255];
// 3D building walls, depth only, for the train canvas: trains behind a building show through it
// as they did when drawn inside the map. Walls alone suffice for things on the ground outside the
// footprints (a ray through a building always crosses one); walls along tile edges lie inside
// the building, so they hide nothing it would not.
// 열차 그리기 · 건물 깊이(web/trains/draw.mjs): 바뀌는 값은 그때그때 읽게 getter 로 넘긴다
const trainLive:TrainLive={trainShown:(p,d)=>journeyMap.trainShown(p,d),journeyTrain:p=>journeyMap.journeyTrain(p),get kitReady(){return kitReady},get RideTrack(){return RideTrack},get CoasterTrain(){return CoasterTrain as TrainLive['CoasterTrain']},get TurtleShips(){return TurtleShips as TrainLive['TurtleShips']},get UnitConvoy(){return UnitConvoy as TrainLive['UnitConvoy']},get SkyUnits(){return SkyUnits as unknown as TrainLive['SkyUnits']},unitLength:k=>UNIT_SHAPES[k]?.len??1,get myLocation(){return (me.shown()||myLocation) as LngLat|null},get trainsEnabled(){return trainsEnabled},get subwayOff(){return journeyMap.subwayOff},get settings(){return modeCtl.settings()},get sheetTrain(){return sheetUI.sheetTrain},get sunTrainShadow(){return sunTrainShadow},get following(){return sheetUI.following},get easing(){return sheetUI.easing},get rider(){return rider},get riding(){return riding}};
const TrainLayer=trainLayerClass({map,JOSEON_STYLE,planner,coasterBodyPx,bodyWidthPx,TRAIN_MIN_PX,cityViaduct,laneOffsetPx,maplibregl,trainPose,trackPoint,mercStop,blendShift,lastPose,toRide,hexRGB,colors,fromRide,coasterCarFrame,smooth,sunPosition,followSoon,trainFrameSoon,TRAIN_FPS,live:trainLive});
const BuildingDepth=buildingDepthClass({cityOn,map,PHONE,maplibregl,live:trainLive});
const exitPillars=new ExitPillars({map,maplibregl,stations,exitCol,colors,hexRGB3,EXIT_MINZOOM,document,getExits:()=>exits,getSelected:()=>selected,getLook:()=>modeCtl.settings().map.exitLook});
// 롤코 선로(modes/coaster/track.mjs)
const coasterTrack=createCoasterTrack({buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS,map,maplibregl,HOME,paths,byId,colors,geom,coasterProfile,coasterAt,coasterRises,loopD,corkOf,rolled,CORK_HEART,edgeOffset,hexRGB,coasterBodyPx,cityViaduct,PHONE,trainFrameSoon,isCoaster:()=>modeCtl.settings().track.kind==='coaster',getSelected:()=>selected,getJourney:()=>journeyMap.journeyRides()});   // 길찾기 탄 구간: 노선색 · 나머지 물러남
let stationAlpha=1;   // station platforms and names: faded behind a 길찾기 route (focusRoute)
const stationNames=new StationNameLayer({map,maplibregl,stationRects,exitCol,cityViaduct,colors,hexRGB3,stationWidthPx,platformPx,PLATFORM_SCALE,closestPlatformPoint,platformStroke,EXIT_MINZOOM,EXIT_MAX_M,EXIT_PASSAGES,document,matchMedia:q=>matchMedia(q),
  getLabels:()=>stationLabels.list,getSelected:()=>selected,getExits:()=>exits,getStationAlpha:()=>stationAlpha,getTrack:()=>modeCtl.settings().track});   // city-life: 심시티 — the bars take the buildings' depth there too (see its render)
// 역 이름표(map/labels.mjs): 보이는 역의 이름표 자료와 그 자리. labels 의 주인
const stationLabels=createStationLabels({map,stations,stationRects,colors,getSelected:()=>selected});
const scheduleLabels=stationLabels.schedule;
function rebuildLabels(){stationLabels.rebuild()}

function filterLine(line:string){
  if(!ready){pendingLine=line;return}
  selected=line;
  map.setFilter('routes',line==='all'?null:['==',['get','line'],line]);
  for(const id of ['stations','stations-casing'])map.setFilter(id,line==='all'?null:['==',['get','line'],line]);
  rebuildLabels();
  const visible=stations.filter(s=>line==='all'||s.lines.some(x=>x.name===line));
  $('mapTitle').textContent=line==='all'?`${stations.length}개 역 노드 전체 보기`:`${line} · ${visible.length}개 역`;
  $('status').textContent=`${line==='all'?'전체 노선':line} · ${visible.length}개 역 위치와 역명을 표시합니다.`;
  feed.reset();planner.clear();lastPose.clear();map.triggerRepaint();
  if(line==='all')map.jumpTo(HOME);
  else{const b=new maplibregl.LngLatBounds();visible.forEach(s=>b.extend([s.lon,s.lat]));map.fitBounds(b,{padding:60,maxZoom:13})}
  refreshLive(true);
}
// 실시간 열차(trains/live_feed.mjs): 받은 기록으로 예측만 다시 세운다
const feed=createLiveFeed({journeyLines:()=>journeyMap.rideLines(),map,stations,liveState:liveState!,getSelected:()=>selected,getSheetTrain:()=>sheetUI.sheetTrain,hasPlans:()=>planner.plans.length>0,age,updateLiveNotice,
  onTrains:trains=>{learnDirections(trains);planner.replacePlans(trains.map(planner.planTrain).filter(Boolean) as TrainPlan[]);lastPose.clear();return planner.plans.length},
  onClear:()=>{planner.clear();lastPose.clear();map.triggerRepaint()},onState:appStatus});
function refreshLive(force=false){return feed.refresh(force)}

map.on('load',()=>{
  registerTransitLayers({map,shapesReady,buildLineFeatures,buildStationFeatures,basicRouteCache,rebuildLabels,stationNames,STATION_WIDTH_STOPS,PHONE,signCollisionLayout:signCollisionLayout as TransitDeps['signCollisionLayout'],live:{get track(){return modeCtl.settings().track}}});   // 노선 · 승강장 · 역 이름표 자리(web/map/layers.mjs)
  // trains: their own canvas over the map (see TRAIN_FPS) — web/map/overlay.mjs
  createTrainOverlay({map,maplibregl,signTextSize,rider,perspectiveRatio,signRows,drawStationSigns,effectiveTheme,REDUCED,TRAIN_FPS,TrainLayer,BuildingDepth,cityOn,cityXrayTargets,mapPalette:mapPalette as unknown as TrainOverlayDeps['mapPalette'],coasterGeo,coasterTrack,geom,edgeOffset,coasterBodyPx,trainBodyPx,cityViaduct,CORK_HEART,PHONE,trainFrameSoon,CityLife,CITY_STYLE:CITY_STYLE as unknown as CityPack,cityPack,$,sunPosition,NightLayer,journeyMap,exitPillars,RIDE_ZOOM,nearMatrix,COCKPIT_NEAR_M,AvatarRenderer,avatarScale,AVATAR_MINZOOM,
    live:{get me(){return me},get frameStats(){return frameStats},get frameMs(){return frameMs()},get trainFrameDue(){return trainTimer?trainAt:Infinity},get LifeUnits(){return LifeUnits},get night(){return nightNow() as TrainOverlayDeps['live']['night']},get bloomTune(){return nightLook.bloomTune},get NightBloom(){return NightBloom},get PixelPalette(){return PixelPalette},get CoasterRidePlacement(){return CoasterRidePlacement},get FestoonLayer(){return FestoonLayer},get RideLayer(){return RideLayer},get busLayer(){return busLayer},get cityBuildings(){return cityBuildings},get cityLandmarks(){return cityLandmarks},get settings(){return modeCtl.settings()},get kitReady(){return kitReady},get sampleRideTracks(){return sampleRideTracks},get selected(){return selected},get stationAlpha(){return stationAlpha},get drawTrains(){return drawTrains},set drawTrains(v){drawTrains=v},get wallsNow(){return wallsNow},set wallsNow(v){wallsNow=v}}});
  registerLocationLayers({map,geolocate,dotMaxzoom:AVATAR_MINZOOM,live:{get myLocation(){return myLocation},set myLocation(v){myLocation=v}}});   // 내 위치 점
  map.on('click',e=>{if(rider.ride)return;if(map.queryRenderedFeatures(e.point,{layers:['stations','stations-casing']}).length)return;const pl=pickTrain(e.point);if(pl)openTrain(pl);else if(busLayer?.selectAt(e.point)){if(busLayer.selection?.kind==='bus')followBusStart(busLayer.selection.id)}else if(!sheetBusy())closeSheet()});   // bus: 누른 버스는 따라간다 · 하는 중인 시트는 빈 곳을 눌러도 둔다   // bus: subway picking keeps priority
  map.on('click','stations',e=>{if(rider.ride)return;const pl=pickTrain(e.point);if(pl){openTrain(pl);return}const p=e.features![0]!.properties,st=byId.get(+p.id);if(appBridge){if(st)appBridge.stationTap(st)}else showStationPopup(st,e.lngLat)});
  map.on('mouseenter','stations',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','stations',()=>map.getCanvas().style.cursor='');
  ready=true;
  // 모드 코드는 첫 화면이 다 뜬 뒤 쉬는 틈에 미리 받아 둔다(모드를 누르면 바로 켜지게)
  map.once('idle',()=>{const go=()=>loadModeKit().then(prebuildCity).catch(()=>{});'requestIdleCallback' in window?requestIdleCallback(go,{timeout:4000}):setTimeout(go,1500)});
  // 도시 건물 미리 짓기(덕배 2026-10-12): 기본 모드에서 지도가 쉴 때마다 지금 보이는 곳의 심시티 · 롤코 건물(같은 팩)을 Worker 로 지어 둔다 —
  // 모드를 누르면 '건물 짓는 중' 없이 바로 올린다. 조선은 다른 팩이라 누를 때 짓는다
  map.on('idle',()=>{if(kitReady)('requestIdleCallback' in window?requestIdleCallback(prebuildCity,{timeout:3000}):setTimeout(prebuildCity,500))});
  // 지도 출처는 늘 펼친 한 줄('ofm' 소스의 © OpenMapTiles © OpenStreetMap)만 — 열차 · 버스 자료 출처는 메뉴 '데이터 출처' 쪽(2026-10-26)
  map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-left');
  // recompute shadows when the view settles or building tiles arrive (debounced)
  let sunTimer=0;const sunSoon=()=>{clearTimeout(sunTimer);sunTimer=setTimeout(()=>{if(!map.isMoving())updateSun()},400)};   // not mid-pan (as the walls): moveend runs it
  map.on('moveend',sunSoon);map.on('sourcedata',e=>{if(e.sourceId==='ofm'&&e.isSourceLoaded&&e.tile)sunSoon()});
  addBasemap();
  // bus: below subway lines, using the existing detail sheet and settings controls.
  busLayer=createBusLayer({map,phone:PHONE,fetcher:(input,init)=>fetch(typeof input==='string'?serverUrl(input):input,init),frameMs,requestRender:()=>trainFrameSoon(0),getExitCoordinates:()=>Object.values(exits).flat() as unknown as ReturnType<BusDeps['getExitCoordinates']&{}>,onSelect:view=>{   // bus: redraw only the train canvas; reserve exit pillars
    if(appBridge){sheetUI.following=null;sheetUI.followBus=null;return appBus(view)}   // 앱 지도 모드: 웹 시트 대신 앱에(busTap · busUpdate)
    // 시트 몸통은 화면 조각(bus/sheet_view.tsx)이 그린다 — 다시 그릴 때 시트 안에 초점이 있었으면 옛 innerHTML 때처럼 제목으로(옛 글자는 브라우저가 고쳐 쓴 글자와 늘 달라 정류장 시트는 매번 갈아 끼웠다)
    sheetUI.following=null;sheetUI.followBus=null;sheetUI.sheetTrain=null;followBtn.hidden=true;const token=openSheetView(body=>{drawBusSheet(body,view);return ()=>clearBusSheet(body)},'bus');
    return next=>{if(sheetUI.sheetToken!==token)return;const focused=sheetBody.contains(document.activeElement);drawBusSheet(sheetBody,next);if(focused)sheetBody.querySelector('h3')?.focus({preventScroll:true})};
  },onRouteSelect:(leg,{fit}:{fit?:boolean}={})=>{   // bus: reuse journey's fitting/focus; closing or deselecting clears only this route-number presentation
    setSubwayOff(!!leg);
    if(leg){ticketRouteGone?.();showRoute({legs:[leg as JourneyLeg]},true,fit??busLayer?.selection?.kind!=='bus')}   // 버스를 눌렀거나 정류장에서 곧 올 버스를 따라가면(fit:false) 노선 전체로 멀어지지 않는다
    else if(journeyMap.busRouteFocus){journeyMap.displayedRoute=null;journeyMap.busRouteFocus=false;journeyMap.routeBounds=null;map.getSource<GeoJSONSource>('journey')?.setData({type:'FeatureCollection',features:[]});focusRoute(false)}
  },onFollow:id=>{if(id)followBusStart(id,{zoom:17});else sheetUI.followBus=null},followedBus:()=>sheetUI.followBus,sheetPad,onFollowView:on=>{sheetUI.tuck(on);document.body.classList.toggle('bus-following',on)},   // 정류장 시트: 같은 번호를 두 번째 누르면 곧 올 버스를 따라간다
  onClear:()=>{if(sheetBody.querySelector('.bus-detail'))closeSheet()},onRelease:()=>appBridge?.busClosed()});
  window.__subwayWebGL.busLayer=busLayer;
  registerExitLayers({map,exitsReady,exitFeatures,EXIT_MINZOOM});   // 출구 번호판
  applyTheme();
  map.getContainer().append(liveNotice);map.getContainer().parentElement!.append(sheet,rideBar);   // train number and destination live in the train popup, not on the map
  if(pendingLine)filterLine(pendingLine);else{rebuildLabels();refreshLive(true)}
  // 앱 지도 모드: 지도가 떴다고 알리고 이때부터 앱의 명령을 받는다. 경로는 승차권 경로 보기(ticketRoute)와 같은 자리 · 맞춰 보기
  appBridge?.ready({showRoute:(plan,pad)=>ticketRoute.show(plan,{bottom:pad.bottom??110,right:pad.right??40}),
    clearRoute:()=>{clearRoute();refreshLive()},
    focusStation:(id,zoom)=>{const st=byId.get(id)!;map.flyTo({center:[st.lon,st.lat],zoom:zoom??Math.max(map.getZoom(),15)})},
    setMode:id=>{void modeCtl.request(id)},...appActions()},
    {mode:modeCtl.current,modes:modes.list().map(mode=>mode.id),colors,theme:theme.themeState(),prefs:prefsState()});
  if(appBridge){animFrame.push(appFollow);map.on('dragstart',appFollow);setInterval(()=>{if(busLayer?.selection)busLayer.refreshDetail()},1000)}   // 끌어서 · 버스가 사라져 풀린 따라가기 · 곧 오는 버스 자리(hero.ratio)
});
// ---- 다리 v2 앱 → 지도 일(앱 지도 모드 — ui/app_bridge.mts) --------------------------------------------
// 버스 시트 자료: 고른 것(selection)과 함께. 자료가 없으면(고른 것을 놓음) 닫힘
function appBus(view:BusSheetView|null){
  const sel=busLayer?.selection;if(!view||!sel){appBridge!.busClosed();return null}
  appBridge!.busTap(view,{kind:sel.kind,id:sel.id});
  return (next:BusSheetView|null)=>{const now=busLayer?.selection;if(next&&now)appBridge!.busUpdate(next,{kind:now.kind,id:now.id})};
}
// 열차 시트(watch): 1초마다 시트와 같은 글자 · 예측이 5초 넘게 없으면 gone(새 자료로 계획이 바뀌는 사이는 같은 id 로 돌아온다 — ride.mts 와 같은 기다림)
let watchTimer:ReturnType<typeof setInterval>|undefined,watchMiss=0;
function watchTick(){
  const id=sheetUI.sheetTrain;if(!id){clearInterval(watchTimer);return}
  const plan=planner.plans.find(p=>p.id===id),now=performance.now();
  if(!plan){if(!watchMiss)watchMiss=now;else if(now-watchMiss>5000){clearInterval(watchTimer);sheetUI.sheetTrain=null;if(sheetUI.following===id)sheetUI.following=null;appFollow();appBridge!.trainGone(id)}return}
  watchMiss=0;appBridge!.trainUpdate({id,...trainNow(plan),ride:canRide()?{cars:plan.cars,rows:rideRows(plan),seat:{...rider.seat}}:null});
}
const hasTrain=(id:string)=>planner.plans.some(p=>p.id===id);
function needBus(){if(!busLayer)throw Error('버스 층이 아직 없다');return busLayer}
function appActions(){return {
  setTheme:(choice:string)=>theme.choose(choice),
  setPadding:(bottom:number)=>{appPad=bottom;if(!rider.ride&&!sheetUI.following&&!sheetUI.followBus)map.easeTo({padding:{top:0,bottom,left:0,right:0},duration:300})},   // 따라가는 중이면 다음 프레임이 이 값으로
  watchTrain:(id:string)=>{clearInterval(watchTimer);sheetUI.sheetTrain=id;watchMiss=0;watchTimer=setInterval(watchTick,1000);watchTick();map.triggerRepaint()},
  unwatchTrain:()=>{clearInterval(watchTimer);sheetUI.sheetTrain=null;sheetUI.following=null;appFollow();map.triggerRepaint()},   // 웹 시트 닫기처럼 열차 따라가기도 놓는다
  followTrain:(id:string)=>{if(!hasTrain(id))throw Error('지금 지도에 없는 열차');sheetUI.sheetTrain=id;follow(id);appFollow()},
  stopFollow:()=>{sheetUI.easing=false;sheetUI.following=null;sheetUI.followBus=null;busLayer?.followChanged();appFollow()},
  startRide:(id:string,seat:{car:number;row:number;side:number})=>{if(!canRide())throw Error('롤코 모드에서만 탈 수 있다');if(rider.ride)throw Error('이미 타는 중');if(!hasTrain(id))throw Error('지금 지도에 없는 열차');
    rider.seat=seat;startRide(id)},
  stopRide:()=>stopRide(false),   // 내려도 웹 열차 시트는 열지 않는다(앱이 연다)
  setPref:(key:string,value:boolean|number)=>{if(key==='prebuild')setPrebuild(!!value);else if(key==='saver')setSaver(!!value);
    else{if(modeCtl.current!=='coaster')throw Error('롤코 모드에서만 속도를 바꾼다');void setCoaster(true,value as number)}},   // 웹도 속도 단추는 롤코 모드에서만 보인다
  skyOpen:(open:boolean)=>{if(open)void theme.openSky(false);else theme.closeSky()},   // 날씨를 받아 sky 를 다시 보낸다(움직임은 앱이 그린다)
  closeBus:()=>needBus().clearSelection(),
  followBus:(id:string)=>{followBusStart(id);appFollow()},
  busRoute:(routeId:string)=>needBus().pressRoute(routeId),
  busRefresh:()=>needBus().refreshArrivals(),
  busStopView:(what:string)=>needBus().stopViewAction(what),
}}

const stationSearch=createStationSearch({map,stations,colors,input:$('search') as HTMLInputElement,list:$('searchList'),getSelected:()=>selected,showStationPopup});   // 역 검색
// ---- icon buttons ----------------------------------------------------------------------------
const svg=(d:string)=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS={
  auto:svg('<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/>'),
  zoom:svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
  coaster:svg('<path d="M2 18c3 0 4-11 7.5-11S12 14 15 14s3.5-6 7-6"/><path d="M5 21v-5M9.5 21V9M15 21v-5M20 21v-10"/>'),
  speed:svg('<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/>'),
};
function iconButton(el:HTMLElement,icon:keyof typeof ICONS,label:string){el.innerHTML=ICONS[icon];el.setAttribute('aria-label',label);el.title=label}
document.head.insertAdjacentHTML('beforeend',`<style>
/* map / trains / theme sit in their own MapLibre control group under +/−, same size and look */
.maplibregl-ctrl-group .map-toggle,.maplibregl-ctrl-group .train-toggle{position:static!important;min-width:0!important;width:29px!important;height:29px!important;padding:0!important;margin:0;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;color:#33434a!important;display:grid!important;place-items:center}
.maplibregl-ctrl-group .map-toggle svg,.maplibregl-ctrl-group .train-toggle svg{width:17px;height:17px}
.maplibregl-ctrl-group .map-toggle+.map-toggle,.maplibregl-ctrl-group .map-toggle+.train-toggle,.maplibregl-ctrl-group .train-toggle+.map-toggle{border-top:1px solid #ddd!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle+.map-toggle,html[data-theme=dark] .maplibregl-ctrl-group .map-toggle+.train-toggle,html[data-theme=dark] .maplibregl-ctrl-group .train-toggle+.map-toggle{border-top-color:#2b3a40!important}
.maplibregl-ctrl-group .map-toggle[aria-pressed=false],.maplibregl-ctrl-group .train-toggle[aria-pressed=false]{color:#a3b0b4!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle,html[data-theme=dark] .maplibregl-ctrl-group .train-toggle{color:#dbe5e8!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle[aria-pressed=false],html[data-theme=dark] .maplibregl-ctrl-group .train-toggle[aria-pressed=false]{color:#61737a!important}
.webgl-zoom{display:flex;align-items:center;gap:3px;padding:4px 7px!important;font-variant-numeric:tabular-nums}
.webgl-zoom svg{width:14px;height:14px}
.legend{display:none}   /* legend removed; data sources stay in the side panel */
</style>`);

// ---- light / dark theme (web/map/theme.mjs) ---------------------------------------------------
let wallsNow=()=>{};   // the train canvas's building walls, again (set up with it)
const prefs=createUserPrefs();   // 내 설정: 이 기기에 고른 테마 · 지도 색(허용 값만)
saverOn=prefs.get('saver')==='on'||location.hash.includes('saver');   // 절전: 이 기기에 고른 값(주소 #saver 로도 — 폰 비교용)
const theme=createMapTheme({map,$,menu,seoulSun,cityPalette:cityPalette as ThemeDeps['cityPalette'],applyCityStyle:(m,o)=>applyCityStyle(m as unknown as CityStyleMap,{...o,groundLight:nightNow().ground}),applyGroundTexture:applyGroundTexture as unknown as ThemeDeps['applyGroundTexture'],syncCity,updateSun,focusRoute,journeyMap,rider,prefs,onTheme:state=>appBridge?.themeChanged(state),onSky:sky=>appBridge?.sky(sky),live:{get settings(){return modeCtl.settings()},get busLayer(){return busLayer},get ready(){return ready},get myLocation(){return myLocation}}});
// 앞에서 만든 층 · 1인칭이 값으로 받아 간 이름이라 끌어올려지는 함수로 남긴다(부르는 건 테마를 만든 뒤)
function effectiveTheme(){return theme.effectiveTheme()}
function mapPalette(t?:Theme){return t===undefined?theme.mapPalette():theme.mapPalette(t)}
function applyTheme(){syncPixels();return theme.applyTheme()}
// 도트(모드 설정 map.pixel — 레트로): 지도 캔버스를 size CSS px 한 칸으로 그리고(픽셀 비율 1/size) 브라우저가 이웃 픽셀 그대로 키운다(CSS pixelated).
// 열차 캔버스는 지도 캔버스 크기를 따라가 같이 도트가 되고, 역 이름표 캔버스는 제 해상도라 글자는 선명하다(overlay). 모드가 바뀔 때마다 applyTheme 가 부른다
// 시야각(map.fov): 좁히면 원근이 거의 없는 아이소메트릭 시점 — 바뀌어 켤 때 45° 대각선 · 55° 기울기로 돌린다(16비트 거리처럼), 끄면 기본 시야각만 되돌린다
let pixelSize:number|null=null,fovNow:number|null=null;
function syncPixels(){const M=modeCtl.settings().map,X=M.pixel,size=X.enabled?X.size:0;if(size!==pixelSize){pixelSize=size;const d=globalThis.devicePixelRatio||1;map.setPixelRatio(size?d/Math.max(1,Math.round(size*d)):BASE_PR);   // 도트 한 칸 = 기기 화소 정수 개(4 · 5 화소가 섞이면 흐릿하고 고르지 않다)
  map.getContainer().classList.toggle('pixel-art',!!size)}
  const fov=M.fov??null;if(fov!==fovNow){const was=fovNow;fovNow=fov;map.setVerticalFieldOfView(fov??BASE_FOV);if(fov!=null&&was==null&&ready)map.easeTo({bearing:45,pitch:55,duration:700})}
  if(!ready)return;const want=!!size&&X.palette!=='none';   // 색표 · 윤곽 층: 지도 캔버스 맨 위(나중에 붙은 도시 층보다도 위로 다시 올린다)
  if(want){if(!map.getLayer('retro-pixels'))map.addLayer(mapPixels);else map.moveLayer('retro-pixels')}else if(map.getLayer('retro-pixels'))map.removeLayer('retro-pixels')}
const mapPixels:FxLayer<import('./city/pixel_palette.mts').PixelPalette>={id:'retro-pixels',type:'custom',renderingMode:'2d',fx:null,onAdd(){},onRemove(m,gl){this.fx?.dispose(gl as WebGL2RenderingContext);this.fx=null},   // 나가면 GL 을 치운다
  render(gl){const X=modeCtl.settings().map.pixel;if(!X.enabled||X.palette==='none'||!PixelPalette)return;if(!this.fx){this.fx=new PixelPalette();this.fx.init(gl)}this.fx.render(gl,{palette:X.palette,outline:X.outline})}};

// ---- sun light and shadows ----------------------------------------------------------------
// Real-time sun position over Seoul drives building face lighting (map light) and ground shadows:
// each building footprint is swept away from the sun by height ÷ tan(elevation) and the hull drawn
// on the ground under the lines. Trains cast their shadow the same way. No shadows after sunset.
let sunTrainShadow:[number,number]=[1.1,1.5];
const sunShadows=new SunShadowLayer();
function updateSun(){
  if(!ready)return;
  const {elevation:el,azimuth:az}=sunPosition(),up=el>1,dark=effectiveTheme()==='dark',S=modeCtl.settings();
  // face lighting: light comes from the sun (polar = 90° − elevation); a soft overhead light at night
  const K=S.sun.light==='park'&&S.map.park[dark?'dark':'light'];   // the park: a warm light, softer (no blue cast at night)
  try{map.setLight({anchor:'map',position:[1.4,up?az:0,up?Math.max(10,90-el):20],intensity:K?K.lightK:up?.55:.3,color:K?K.light:dark?'#9fb4c8':'#ffffff'})}catch{}
  // trains: shadow away from the sun, longer when it is low
  const sh=up?Math.min(7,1.6/Math.tan(el*Math.PI/180)):1.2,away=(az+180)*Math.PI/180;
  sunTrainShadow=up?[Math.sin(away)*sh,-Math.cos(away)*sh]:[.8,1.1];
  // buildings
  if(!up||map.getZoom()<14.5||!map.getLayer('bm-bld3d')||map.getLayoutProperty('bm-bld3d','visibility')==='none'){sunShadows.set(null,0);map.triggerRepaint();return}
  const k=1/Math.tan(el*Math.PI/180),ux=Math.sin(away),uy=Math.cos(away),seen=new Set(),tris=[];
  const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter());
  for(const f of map.querySourceFeatures('ofm',{sourceLayer:'building'})){
    const h0=+(f.properties.render_height??10),h=S.sun.lowHouseM!=null&&h0<S.city.pack.hanok.tall.towerMinH?S.sun.lowHouseM:h0,g=f.geometry;   // 조선: a low building is a low house; a tall one keeps its height (한옥 고층 · 목탑)
    if(!h||!g)continue;
    const rings=g.type==='Polygon'?[g.coordinates[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):[];
    for(const ring of rings){
      if(!ring||ring.length<3)continue;
      const key=ring[0]![0]!.toFixed(6)+ring[0]![1]!.toFixed(6)+h;if(seen.has(key))continue;seen.add(key);
      // real low-sun shadows run ~10× the height; on a map that blankets whole blocks, so cap at 3.5× height / 250 m
      const len=Math.min(S.city.enabled?+(S.city.pack.lighting?.shadow?.maxLengthM??80):250,h*Math.min(k,3.5)),kx=Math.cos(ring[0]![1]!*Math.PI/180),dx=ux*len/(111320*kx),dy=uy*len/111320;
      const pts:LngLat[]=[];for(const [x,y] of ring as LngLat[]){pts.push([x,y]);pts.push([x+dx,y+dy])}
      const hp=hull(pts).map((q):LngLat=>{const m=maplibregl.MercatorCoordinate.fromLngLat(q);return [m.x-O.x,m.y-O.y]});
      for(let i=1;i<hp.length-1;i++)tris.push(...hp[0]!,...hp[i]!,...hp[i+1]!);   // convex hull → triangle fan
    }
  }
  // fade in over the first ~8° after sunrise (and out before sunset): very long low-sun shadows get cut off otherwise
  const fade=Math.max(0,Math.min(1,(el-2)/13));   // fade in over the first ~15° after sunrise, out before sunset
  // phones: small bright screens make the same shade read much darker, so lighten it there
  const phone=matchMedia('(max-width:720px),(pointer:coarse)').matches?.35:1;
  const cityA=cityOn()?+(cityPack().modes?.[S.city.tone]?.shadowOpacity?.[dark?'dark':'light']??.14):null;   // city-build: the city's shadow strength and colour from the style pack
  sunShadows.color=cityA!=null?hexRGB3(cityPack().lighting?.shadow?.color||'#394D4B') as [number,number,number]:null;
  sunShadows.set({data:new Float32Array(tris),ox:O.x,oy:O.y},cityA!=null?cityA*fade*phone:Math.min(S.map.paletteKind==='park-city'?mapPalette().shadow as number:.34,.14+el/150)*fade*(dark?.55:1)*phone);
  map.triggerRepaint();
}

applyTheme();

// Background map: OpenFreeMap vector tiles (OSM data, no key) drawn with only water, green space,
// streets and faint building footprints — no shops, stops or labels competing with the lines.
// 바탕 지도: OpenFreeMap 벡터 타일(web/map/layers.mjs) — 처음 켤 때 한 번 등록
function addBasemap(){addBasemapLayers({map,sunShadows,PHONE,CITY_STYLE,addCityLayers:addCityLayers as unknown as Parameters<typeof addBasemapLayers>[0]['addCityLayers'],applyTheme})}
// ---- 모드 전환 (상태의 주인: modeCtl — web/modes/transition.mjs) ----------------------------------------
// 준비: 모드 코드(심시티 · 조선 · 롤코 — 첫 화면에서는 받지 않았다), 롤코는 언덕을 정할 건물 높이도. 이미 있으면 true(바로 바꾼다)
function prepareMode(id:string){
  if(id==='basic')return true;
  if(id==='coaster')return coasterGeo.bld&&kitReady?true:Promise.all([loadCoasterBuildings(),loadModeKit()]);   // its courses need the buildings: wait for them
  return kitReady?true:loadModeKit();
}
// 모드 바꾸는 중 게이지(행님 2026-10-11: 바꾸면 2~3초 아무 표시 없이 그대로라 고장 난 줄 알았다): 받는 중(모드 코드 · 롤코 건물 높이) →
// 도시 모드면 지금 보이는 건물 타일을 다 지을 때까지 '건물 짓는 중 n/m'. 기본 모드 · 건물이 안 보이는 줌이면 바꾸자마자 닫는다
const modeBusy=(()=>{
  let el:HTMLElement|null=null,bar:HTMLElement|null=null,text:HTMLElement|null=null,timer=0,t0=0,want:string|null=null,phase='';
  const label=(id:string|null)=>(modes.list().find(d=>d.id===id)?.label??id) as string;
  const ro=(w:string)=>{const c=w.charCodeAt(w.length-1)-0xAC00;return c>=0&&c<11172&&c%28&&c%28!==8?'으로':'로'};   // 받침(ㄹ 빼고) 있으면 '으로'
  function show(sub:string,frac:number|null){
    if(!el){el=document.createElement('div');el.className='mode-busy';el.setAttribute('role','status');el.innerHTML='<b></b><span></span><i><em></em></i>';document.body.append(el);text=el.querySelector('span');bar=el.querySelector('em')}
    el.querySelector('b')!.textContent=`${label(want)}${ro(label(want))} 바꾸는 중`;text!.textContent=sub;
    el.classList.toggle('mode-busy--wait',frac==null);bar!.style.width=frac==null?'':`${Math.round(Math.max(.06,frac)*100)}%`;el.hidden=false}
  function end(){clearInterval(timer);timer=0;phase='';if(el)el.hidden=true}
  function tick(){
    if(phase==='prepare'){if(modeCtl.desired!==want)end();return}
    const B=cityBuildings;if(!cityOn()||!B?.shown()||performance.now()-t0>20000)return end();
    const {ready,total}=B.progress();if(total&&ready>=total)return end();
    show(total?`건물 짓는 중 ${ready}/${total}`:'건물 짓는 중',total?ready/total:null)}
  return {
    request(id:string,now:string){want=id;if(id===now){end();return}phase='prepare';t0=performance.now();show(id==='coaster'&&!coasterGeo.bld?'롤코 자료 받는 중':'모드 자료 받는 중',null);clearInterval(timer);timer=setInterval(tick,200)},
    committed(id:string){if(id!==want)return;phase='build';t0=performance.now();if(!timer)timer=setInterval(tick,200);tick()},
    end};
})();
// 버튼: 원하는 모드(받는 중이면 그 모드)를 눌린 것으로, 준비가 실패하면 지금 모드로
function showModeButtons(want:string){menu.press('toggleSimcity',want==='simcity');menu.press('toggleJoseon',want==='joseon');menu.press('toggleRetro',want==='retro');showNation(want);menu.press('toggleCoaster',want==='coaster');showRace(want)}
let lastRace='terran';   // 마지막에 고른 종족(처음엔 테란) — 스위치만 켜면 이 종족으로
// 스타크래프트: 스위치는 종족 하나라도 켜져 있으면 눌림, 그 아래 종족 줄은 켜져 있을 때만(고른 종족이 눌림)
function showRace(want:string){const on=STARCRAFT.includes(want);if(on)lastRace=want;menu.press('toggleStarcraft',on);menu.hide('starcraftRace',!on);
  menu.race(want)}
// 바꾸기: 옛 setCoaster · setSimcity 가 하던 차례 그대로(롤코 → 심시티는 롤코를 끈 뒤 심시티를 켠다)
function commitMode(prev:string,next:string,{speed}:{speed?:number}={}){
  if(next==='coaster'){applyCoaster(true,speed??(prev==='coaster'?modeCtl.speed:1));return}   // (심시티 · 조선에서 오면 applyCoaster 가 먼저 끈다)
  if(prev==='coaster')applyCoaster(false);
  if(next==='basic'){if(CITY_FAMILY.includes(prev))applySimcity(false);return}
  applySimcity(true,next);
}
// 롤러코스터: on, the lines are lifted onto their own paths (coasterPath; the route lines on the ground follow them, faintly) and the view
// tilts to show it; the speed buttons run its clock ×1/×5/×20 (1배 = back to the live positions)
// 롤코 속도 안내 한 줄(메뉴 · 다리 prefs 가 같이 쓴다)
function speedNote(){return modeCtl.speed>1?'실제보다 앞서 달려요':'실시간'}
function applyCoaster(on:boolean,speed?:number){
  if(!on)stopRide(false);   // 롤코를 끄면 1인칭에서도 내려요(옛 상태를 읽을 수 있는 동안)
  if(on&&modeCtl.current!=='basic'&&modeCtl.current!=='coaster'){modeCtl.enter('basic');menu.press('toggleSimcity',false);menu.press('toggleJoseon',false);showRace('coaster')}
  const was=modeCtl.current==='coaster';modeCtl.enter(on?'coaster':'basic');modeCtl.setSpeed(on?speed!:1);
  menu.press('toggleCoaster',on);menu.hide('coasterSpeed',!on);
  menu.speed(modeCtl.speed,speedNote());appBridge?.prefsChanged(prefsState());
  if(was!==on){stopMerc.clear();cityViaduct.setGaps(on?coasterGaps as Parameters<typeof cityViaduct.setGaps>[0]:null);setRouteOpacity();map.getSource<GeoJSONSource>('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});planner.rebuild();lastPose.clear();
    if(map.getSource('stations')){map.getSource<GeoJSONSource>('stations')!.setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels()}
    if(journeyMap.displayedRoute)showRoute(journeyMap.displayedRoute.plan,journeyMap.displayedRoute.busSelection,false);
    if(on&&map.getPitch()<40)map.easeTo({pitch:60,zoom:Math.max(map.getZoom(),14.5),duration:900});
    applyTheme();updateSun();wallsNow()}   // the park colours, and the towers out of the shadows and walls
  map.triggerRepaint();
}
// 조선 · 스타크래프트 종족 are 심시티 in another pack or look (id: CITY_FAMILY 의 하나): switching between them changes only the look — 선로 설정(track)이 같으면(같은 참조) 경로 · 승강장은 그대로,
// 예측 정차 수(trains.predictStops)만 다르면 예측만 다시
function applySimcity(on:boolean,id='simcity'){
  const was=modeCtl.settings(),next=on?id:'basic',same=modeCtl.current===next;modeCtl.enter(next);const now=modeCtl.settings();
  if(now.track===was.track){if(now.trains.predictStops!==was.trains.predictStops){planner.rebuild();lastPose.clear()}if(!same){applyTheme();updateSun();map.triggerRepaint()}return}
  setRouteOpacity();planner.rebuild();lastPose.clear();map.getSource<GeoJSONSource>('routes')?.setData({type:'FeatureCollection',features:buildLineFeatures()});if(map.getSource('stations')){map.getSource<GeoJSONSource>('stations')!.setData({type:'FeatureCollection',features:buildStationFeatures()});rebuildLabels()}applyTheme();updateSun();wallsNow();map.triggerRepaint()}   // 심시티에서는 노선 선의 투명도와 고가 표시를 바꾸고 같은 도로 맞춤 경로를 유지해요.
// 요청(버튼 · 창구). 끄기: 그 가족이 켜져 있으면 기본으로(롤코를 끄면 1인칭에서도 내려요 — 바꾸기 안에서 한 번), 받는 중이기만 하면 그 요청만 거둔다(지금 모드 그대로),
// 다른 가족만 켜져 있거나 받는 중이면 그대로 둔다
function offFamily(ids:readonly string[]){if(ids.includes(modeCtl.current))return modeCtl.request('basic');if(ids.includes(modeCtl.desired))modeCtl.cancel()}
function setCoaster(on:boolean,speed?:number){return on?modeCtl.request('coaster',{speed}):offFamily(['coaster'])}
function setSimcity(on:boolean,asJoseon=false){return on?modeCtl.request(asJoseon?'joseon':'simcity'):offFamily(['simcity','joseon'])}
// 스타크래프트: 종족(race)을 안 주면 마지막에 고른 종족(lastRace)
function setStarcraft(on:boolean,race?:string){return on?modeCtl.request(race??lastRace):offFamily(STARCRAFT)}
function setRetro(on:boolean){return on?modeCtl.request('retro'):offFamily(['retro'])}
// 나라: 스위치는 나라 하나라도 켜져 있으면 눌림, 그 아래 나라 줄은 켜져 있을 때만. 나라를 안 주면 마지막에 고른 나라
let lastNation=NATIONS[0]!;
function showNation(want:string){const on=NATIONS.includes(want);if(on)lastNation=want;menu.press('toggleNation',on);menu.hide('nationRow',!on);
  menu.nation(want)}
function setNation(on:boolean,id?:string){return on?modeCtl.request(id??lastNation):offFamily(NATIONS)}
menu.on({switches:{toggleSimcity:()=>setSimcity(modeCtl.desired!=='simcity'),   // 받는 중에 다시 누르면 취소
  toggleJoseon:()=>setSimcity(modeCtl.desired!=='joseon',true),toggleStarcraft:()=>setStarcraft(!STARCRAFT.includes(modeCtl.desired)),
  toggleRetro:()=>setRetro(modeCtl.desired!=='retro'),toggleNation:()=>setNation(!NATIONS.includes(modeCtl.desired)),toggleCoaster:()=>setCoaster(modeCtl.desired!=='coaster')},
  nation:id=>setNation(true,id),race:race=>setStarcraft(true,race),speed:speed=>setCoaster(true,speed)});
const setJoseon=(on:boolean)=>setSimcity(on,true);
// 건물 미리 짓기 버튼: 바꾸면 이 기기에 저장, 켜면 바로 한 번 짓는다(이미 지은 건 끌 때 그대로 — 비교는 바꾼 뒤 새로고침) — 앱의 setPref 도 같은 길
function setPrebuild(on:boolean){prebuildOn=on;prefs.set('prebuild',on?'on':'off');menu.press('togglePrebuild',on);if(on)prebuildCity();appBridge?.prefsChanged(prefsState())}
// 절전 버튼: 바꾸면 이 기기에 저장, 바로 다음 프레임부터
function setSaver(on:boolean){saverOn=on;prefs.set('saver',on?'on':'off');menu.press('toggleSaver',on);trainFrameSoon(0);appBridge?.prefsChanged(prefsState())}
function prefsState(){return {prebuild:prebuildWant(),saver:saverOn,speed:modeCtl.speed,speedNote:speedNote()}}
menu.press('togglePrebuild',prebuildWant());menu.press('toggleSaver',saverOn);
menu.on({switches:{togglePrebuild:()=>setPrebuild(!prebuildWant()),toggleSaver:()=>setSaver(!saverOn)}});
// ---- settings (header hamburger → right drawer): on/off switches ----
{
  {const z=$('zoomBadge'),show=()=>{z.textContent='z'+map.getZoom().toFixed(1);appStatus()};map.on('zoom',show);show()}   // the zoom beside 새로고침, for checking views
  $('refreshButton').onclick=e=>{(e.currentTarget as HTMLElement).classList.add('spin');setTimeout(()=>location.reload(),250)};   // picks up a new deploy (plain asset URLs, no cache-busting)
  const btn=$('settingsButton'),panel=$('settingsPanel');
  menu.icons(ICONS.coaster,ICONS.speed);
  // 설정 서랍(햄버거): 열 때 hidden 을 풀고 한 프레임 뒤 .open 으로 밀어 내고, 닫을 때 .open 을 떼고 밀려 들어간 뒤 hidden.
  // 버스 층은 panel.hidden=true 로 바로 닫는다 — 그래서 '열림'은 hidden 이 아니고 .open 이 붙은 때다
  const isOpen=()=>!panel.hidden&&panel.classList.contains('open');
  // 두 단계: 목록(#menuRoot)의 항목을 누르면 그 쪽(.menu-page)만 보이고 머리 제목이 그 이름, ‹ 로 목록에 돌아온다. 다시 열면 늘 목록부터
  const root=$('menuRoot'),back=$('menuBack'),title=$('settingsTitle'),pages=[...panel.querySelectorAll<HTMLElement>('.menu-page')];let pageFrom:HTMLElement|null=null;
  const slide=(el:HTMLElement,cls:string)=>{el.classList.remove('menu-in','menu-out');if(!slideMs)return;void el.offsetWidth;el.classList.add(cls)};
  const showPage=(id:string|null|undefined,animate=true)=>{
    const page=id?$(id):null;
    for(const p of pages)p.hidden=p!==page;
    root.hidden=!!page;back.hidden=!page;
    title.textContent=page?(page.getAttribute('aria-label')||page.querySelector('h3')?.textContent||''):'메뉴';
    if(!animate)return;
    if(page){slide(page,'menu-in');back.focus({preventScroll:true})}
    else{slide(root,'menu-out');pageFrom?.focus({preventScroll:true})}
    panel.querySelector('.menu-body')!.scrollTop=0;
  };
  for(const item of root.querySelectorAll<HTMLElement>('[data-menu-page]'))item.onclick=()=>{pageFrom=item;showPage(item.dataset.menuPage)};
  back.onclick=()=>showPage(null);
  const slideMs=matchMedia('(prefers-reduced-motion: reduce)').matches?0:260;let closeTimer=0;
  const setOpen=(o:boolean)=>{
    clearTimeout(closeTimer);btn.setAttribute('aria-expanded',String(o));
    if(o){showPage(null,false);panel.classList.remove('open');panel.hidden=false;void panel.offsetWidth;panel.classList.add('open');void theme.openSky();$('settingsClose').focus({preventScroll:true});return}
    theme.closeSky();panel.classList.remove('open');closeTimer=setTimeout(()=>{if(!panel.classList.contains('open'))panel.hidden=true},slideMs);
  };
  const close=()=>{if(!isOpen())return;setOpen(false);btn.focus({preventScroll:true})};
  btn.onclick=e=>{e.stopPropagation();setOpen(!isOpen())};
  $('settingsClose').onclick=close;
  // 지도와 함께 보는 쪽(.with-map — 승차권 경로 고르기)에서는 지도 · 서랍 · 지도 조작 단추(+ − · 내 위치) · 아래 시트 위에서 누르기 시작했으면 서랍을 닫지 않는다.
  // 끌다가 서랍 · 머리줄 위에서 손을 떼면 click 이 둘의 공통 조상(body)으로 와 '밖을 눌렀다'로 읽히기 때문(누르기를 시작한 곳으로 본다). 길찾기 같은 지도 위 단추는 지금처럼 닫는다
  let pressKeeps=false;
  document.addEventListener('pointerdown',e=>{const at=e.target as Element|null;pressKeeps=panel.classList.contains('with-map')&&!!at&&(panel.contains(at)||map.getCanvasContainer().contains(at)||!!at.closest?.('.maplibregl-ctrl,.sheet'))},true);
  document.addEventListener('pointerup',()=>setTimeout(()=>{pressKeeps=false}),true);   // click 은 손을 뗀 바로 뒤에 오므로 그 뒤에 푼다(끌기만 하고 click 이 안 와도 남지 않게)
  document.addEventListener('click',e=>{const at=e.target as Node|null;if(pressKeeps){pressKeeps=false;return}if(isOpen()&&!panel.contains(at))setOpen(false)});   // 뒤 가림막(.menu-scrim)을 누르면 여기로 온다
  document.addEventListener('keydown',e=>{
    if(!isOpen())return;
    if(e.key==='Escape'){close();return}
    if(e.key!=='Tab')return;   // 서랍이 열려 있는 동안 Tab 은 서랍 안에서만 돈다
    const items=[...panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input')].filter(el=>el.offsetParent);if(!items.length)return;   // 내 정보 쪽의 링크 · 입력칸도 돈다
    const first=items[0]!,last=items[items.length-1]!;
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
}
// 회원(로그인 줄 · 내 정보 · 승차권): 첫 화면 코드에 넣지 않고 지도가 한 번 다 그려진 뒤 받는다. 로그인에서 돌아온 주소(#login=…)면 바로,
// 그 전에 메뉴 버튼을 누르면 그때 바로(지도를 기다리느라 메뉴 칸이 늦게 뜨지 않게). 한 번만 받는다
if(!appBridge){let started=false;const go=()=>{if(started)return;started=true;import('./user/account.mts').then(m=>m.initAccount({colors,routeMap:ticketRoute,myLocation:()=>myLocation})).catch(()=>{})};   // colors: 승차권 경로 띠(길찾기와 같은 노선 색)
  if(location.hash.includes('login='))go();else{map.once('idle',()=>'requestIdleCallback' in window?requestIdleCallback(go,{timeout:4000}):setTimeout(go,1500));
    for(const type of ['pointerdown','click'])document.getElementById('settingsButton')?.addEventListener(type,go,{once:true})}}
map.on('move',scheduleLabels);map.on('resize',scheduleLabels);
feed.start();
window.__subwayWebGL={map,me,setNightLook,get nightLook(){return {...nightLook}},get nightDebug(){return {night:nightNow(),mapLayer:!!map.getLayer('city-night-bloom'),mapFx:!!mapBloom.fx,mapErr:mapBloom.fx?map.painter.context.gl.getError():null,order:map.getStyle().layers.map(l=>l.id).slice(-12)}},modeSettings:(name:string)=>modes.settings(name),explainMode:(name:string)=>modes.explain(name),get cityBuildings(){return cityBuildings},loadModeKit,cityViaduct,setSimcity,setJoseon,setStarcraft,setCoaster,setRetro,get retro(){return modeCtl.current==='retro'},setNation,get nation(){return NATIONS.includes(modeCtl.current)?modeCtl.current:null},get simcity(){return modeOn.simcity},get joseon(){return modeOn.joseon},get starcraft(){return modeOn.starcraft?modeCtl.current:null},get coaster(){return modeOn.coaster},refreshLive,updateSun,applyTheme,sunPosition,trackPoint,edgeCoords,coasterRises,coasterProfile,inversion,loopD,get paths(){return paths},get byId(){return byId},get plans(){return planner.plans},get renderer(){return map.getCanvas().getContext('webgl2')?'webgl2':'none'},showTrainPopup,startRide,stopRide,get ride(){return rider.ride},get c88(){return CoasterTrain.last},get ships(){return TurtleShips.last},get convoy(){return UnitConvoy?.last??null},get frames(){return {...frameStats}},get sky(){return SkyUnits?.last??null},rideFrame,set rideSeat(v:typeof rider.seat){rider.seat=v}};
