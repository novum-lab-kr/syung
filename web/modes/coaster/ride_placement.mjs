// Read the same z14 building footprints as CityBuildings, before admitting a ride to the renderer.
// Neighbourhoods settle once in a stable order; camera movement never moves or changes a ride.
import {decodeTile} from '../../city/mvt.mts';
import {classifyRings,bbox} from '../../city/geom.mts';
import {selectRideSites,withRideKind,RIDE_SITE_RULES} from './ride_sites.mjs';

const EARTH=40075016.685578488,TILE_Z=14;
const railCache=new WeakMap();
// The canonical sampler includes hills, loops, corkscrews and tower spirals. A conservative
// corridor covers both rail lanes, screen-size offsets and the rolled spine at z14 through z18.
export function sampleRideTracks(track,bounds,{geometry,offset,bodyPx,lanePx,heart}){
  if(!track.edges)throw Error('coaster placement: rail sampler is not ready');
  let cache=railCache.get(track);if(!cache){cache=new Map();railCache.set(track,cache)}
  const out=[];
  for(const c of track.pieces()){
    const g=geometry(c.e),mu=g.pts[0].meterInMercatorCoordinateUnits();
    const metresPerPx=1/(512*2**14*mu),radius=(Math.abs(offset(c.e))+lanePx+bodyPx*(.3+2*heart)+3)*metresPerPx+8,r=radius*mu;
    if(c.box[2]+r<bounds[0]||c.box[0]-r>bounds[2]||c.box[3]+r<bounds[1]||c.box[1]-r>bounds[3])continue;
    let segments=cache.get(c.id);
    if(!segments){
      segments=[];const at=track.sampler(c.e),n=Math.max(1,Math.ceil((c.s1-c.s0)/(8*mu)));
      let q=at(c.s0),a=[q.x,q.y,q.h/mu];
      for(let i=1;i<=n;i++){q=at(c.s0+(c.s1-c.s0)*i/n);const b=[q.x,q.y,q.h/mu];segments.push({a,b,radius});a=b}
      cache.set(c.id,segments);
    }
    for(const s of segments)if(Math.max(s.a[0],s.b[0])+r>=bounds[0]&&Math.min(s.a[0],s.b[0])-r<=bounds[2]&&Math.max(s.a[1],s.b[1])+r>=bounds[1]&&Math.min(s.a[1],s.b[1])-r<=bounds[3])out.push(s);
  }
  return out;
}

function buildingObstacles(layer,{x,y,z=TILE_Z,minH=3,missingH=9,maxH=Infinity}={}){
  const out=[];
  if(!layer)return out;
  const n=2**z,E=layer.extent,lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/n))),mu=1/(EARTH*Math.cos(lat));
  const world=r=>r.map((v,i)=>(v/E+(i%2?y:x))/n);
  for(let i=0;i<layer.length;i++){
    const f=layer.feature(i),p=f.properties||{};if(p.hide_3d===true||p.hide_3d==='true')continue;
    const H=Math.max(minH,Number.isFinite(+p.render_height)?+p.render_height:missingH);
    if(H>=maxH)continue;
    const base=Math.min(Math.max(0,+p.render_min_height||0),H-.5);
    const polys=classifyRings(f.loadGeometry().map(r=>r.flatMap(p=>[p.x,p.y])));
    for(const poly of polys){
      if(poly.area2/2/(n*E*mu)**2<4)continue;
      const outer=world(poly.outer),holes=poly.holes.map(world);
      out.push({outer,holes,box:bbox(outer),base,height:H});
    }
  }
  return out;
}

export function rideBuildingObstacles(raw,options={}){
  return buildingObstacles(decodeTile(raw,new Set(['building'])).building,options);
}

// Parks (urban parks: landcover grass/park and the like, theme parks and zoos from landuse) are where the rides go;
// water is excluded even if it has no building footprints.
export function rideTileObstacles(raw,options={}){
  const layers=decodeTile(raw,new Set(['building','landuse','landcover','water'])),{x,y,z=TILE_Z}=options,n=2**z;
  const parks=[],water=[],parkKinds=new Set(['park','recreation_ground','village_green','theme_park','zoo']);
  for(const name of ['landuse','landcover','water']){
    const layer=layers[name];if(!layer)continue;
    const world=r=>r.map((v,i)=>(v/layer.extent+(i%2?y:x))/n);
    for(let i=0;i<layer.length;i++){
      const f=layer.feature(i),p=f.properties||{};
      if(f.type!==3||name!=='water'&&!parkKinds.has(p.class)&&!parkKinds.has(p.subclass))continue;
      for(const poly of classifyRings(f.loadGeometry().map(r=>r.flatMap(p=>[p.x,p.y])))){
        const outer=world(poly.outer),holes=poly.holes.map(world);
        (name==='water'?water:parks).push({outer,holes,box:bbox(outer)});
      }
    }
  }
  return {buildings:buildingObstacles(layers.building,options),parks,water};
}

function neighbourhoods(candidates,moveM){
  const remaining=new Set(candidates),groups=[];
  for(const seed of candidates){
    if(!remaining.delete(seed))continue;
    const sites=[seed];
    for(let i=0;i<sites.length;i++)for(const s of remaining){const a=sites[i];
      // Two moves plus the largest same-kind separation must settle together.
      if(Math.hypot(a.x-s.x,a.y-s.y)<(2*moveM+650)*Math.max(a.mu,s.mu)){remaining.delete(s);sites.push(s)}
    }
    const box=[Infinity,Infinity,-Infinity,-Infinity],tiles=new Map(),n=2**TILE_Z;
    for(const s of sites){
      const r=(moveM+Math.max(...['drop','ferris','swing','saucer'].map(k=>withRideKind(s,k).wide))*(s.lotte?1:2.4)+RIDE_SITE_RULES.clearanceM+4)*s.mu;
      box[0]=Math.min(box[0],s.x-r);box[1]=Math.min(box[1],s.y-r);box[2]=Math.max(box[2],s.x+r);box[3]=Math.max(box[3],s.y+r);
      for(let x=Math.floor((s.x-r)*n);x<=Math.floor((s.x+r)*n);x++)for(let y=Math.floor((s.y-r)*n);y<=Math.floor((s.y+r)*n);y++)tiles.set(x+','+y,{x,y});
    }
    groups.push({candidates:sites,box,tiles:[...tiles.values()],state:'waiting',sites:[],omitted:[]});
  }
  return groups;
}

export class CoasterRidePlacement {
  // inPark: rides only inside parks (the coaster today); false keeps the old rule (move at most moveM, parks preferred, small rides over low roofs)
  constructor(candidates,{map,readTile,getTracks=()=>[],onChange=()=>{},minH=3,missingH=9,maxH=Infinity,inPark=true}={}){
    this.inPark=inPark;this.map=map;this.groups=neighbourhoods(candidates,inPark?RIDE_SITE_RULES.parkMoveM:RIDE_SITE_RULES.moveM);this.tiles=new Map();this.sites=[];this.revision=0;
    this.getTracks=getTracks;this.onChange=onChange;this.heightPolicy={minH,missingH,maxH};
    this.readTile=readTile||((tile)=>this.mapTile(tile));this.stats={accepted:0,omitted:0,pending:0,failed:0,groups:this.groups.length};
  }
  async mapTile({x,y,z,key}){
    const manager=this.map.style?.tileManagers?.ofm;
    for(const id of manager?.getRenderableIds()||[]){
      const tile=manager.getTileByID(id),c=tile?.tileID?.canonical;
      if(c?.x===x&&c.y===y&&c.z===z&&tile.latestFeatureIndex?.rawTileData)
        return rideTileObstacles(tile.latestFeatureIndex.rawTileData,{x,y,z,...this.heightPolicy});
    }
    const template=this.map.getSource('ofm')?.tiles?.[0];
    if(!template)throw Error('coaster placement: building tile source is not ready');
    const url=template.replace('{z}',z).replace('{x}',x).replace('{y}',y);
    const response=await fetch(url);if(!response.ok)throw Error(`coaster placement: ${key} HTTP ${response.status}`);
    return rideTileObstacles(await response.arrayBuffer(),{x,y,z,...this.heightPolicy});
  }
  tile(x,y){
    const z=TILE_Z,key=`${z}/${x}/${y}`;
    if(!this.tiles.has(key))this.tiles.set(key,Promise.resolve().then(()=>this.readTile({x,y,z,key})).catch(e=>{this.tiles.delete(key);throw e}));
    return this.tiles.get(key);
  }
  async load(g){
    g.state='loading';this.count();
    try{
      const buildings=[],parks=[],water=[];
      // Bounded per-neighbourhood queue. Existing map tiles are reused; neighbouring tiles fill any holes.
      for(let i=0;i<g.tiles.length;i+=4){
        const batch=await Promise.all(g.tiles.slice(i,i+4).map(({x,y})=>this.tile(x,y)));
        for(const tile of batch){
          buildings.push(...(Array.isArray(tile)?tile:tile.buildings));
          parks.push(...(tile.parks||[]));water.push(...(tile.water||[]));
        }
      }
      const tracks=await this.getTracks(g.box);
      const result=selectRideSites(g.candidates,{buildings,tracks,parks,water,relocate:true,inPark:this.inPark});
      g.sites=result.sites;g.omitted=result.omitted;g.state='ready';delete g.error;
      // 자리를 다 골랐으면 받아 둔 건물 · 공원 · 물 자료는 버린다(한 번 정한 자리는 다시 안 고른다). 들고 있던 때는 롤코를 타고 달리면
      // 지나는 동네마다 z14 타일(강남 1.4 MB · 구의 0.7 MB)이 쌓여, 아이폰 홈 화면 웹앱이 타고 좀 있다 새로고침됐다(덕배 2026-10-15, 추측 원인).
      // 옆 동네가 같은 타일을 나중에 쓰면 지도 타일(없으면 받기)에서 다시 읽는다
      for(const {x,y} of g.tiles)this.tiles.delete(`${TILE_Z}/${x}/${y}`);
      this.sites=this.groups.flatMap(g=>g.sites).sort((a,b)=>a.lon-b.lon||a.lat-b.lat);this.revision++;
      this.count();this.onChange(this.sites);
    }catch(e){g.state='failed';g.error=String(e);g.retryAt=Date.now()+15000;this.count()}
  }
  count(){this.stats={accepted:this.sites.length,moved:this.sites.filter(s=>s.move_m>0).length,compact:this.sites.filter(s=>s.compact).length,elevated:this.sites.filter(s=>s.base_m>0).length,omitted:this.groups.reduce((n,g)=>n+g.omitted.length,0),
    pending:this.groups.filter(g=>g.state==='loading').length,failed:this.groups.filter(g=>g.state==='failed').length,groups:this.groups.length,tiles:this.tiles.size,revision:this.revision}}
  update(bounds){
    const jobs=[];
    for(const g of this.groups){
      if(g.state==='loading'||g.state==='ready'||g.state==='failed'&&Date.now()<g.retryAt)continue;
      // Include the top's projected reach. Collision coverage itself uses the full physical footprint.
      const pad=Math.max(...g.candidates.map(s=>s.top*1.35*s.mu));
      if(g.box[2]+pad<bounds[0]||g.box[0]-pad>bounds[2]||g.box[3]+pad<bounds[1]||g.box[1]-pad>bounds[3])continue;
      jobs.push(this.load(g));
    }
    if(jobs.length)return Promise.all(jobs);
  }
}
