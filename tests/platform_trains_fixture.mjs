import vm from 'node:vm';
import {platformRuntime,distance,local,shifted} from './platform_endpoints_fixture.mjs';
class MercatorCoordinate {
 constructor(x,y){this.x=x;this.y=y;}
 static fromLngLat(p){const c=Array.isArray(p)?p:[p.lng,p.lat];return new this((c[0]+180)/360,(1-Math.log(Math.tan(Math.PI/4+c[1]*Math.PI/360))/Math.PI)/2);}
 toLngLat(){const a=[this.x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*this.y)))*180/Math.PI];return {lng:a[0],lat:a[1],toArray:()=>a};}
 meterInMercatorCoordinateUnits(){return 1/(40075016.686*Math.cos(this.toLngLat().lat*Math.PI/180));}
}
export function trainRuntime(source,zoom=16,helpers={}){
 const r=platformRuntime(source,zoom,helpers),s=r.source;
 const slice=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
 r.context.maplibregl={MercatorCoordinate};
 vm.runInContext([
   slice('const edgeGeom=new Map();','// 기본·심시티'),
   slice('function cityGeom(', '// 롤러코스터 경로:'),
   slice('function along(', '// Stations are drawn'),
   'const mercStop=(line,s)=>maplibregl.MercatorCoordinate.fromLngLat(stopPos(line,s));',
   slice('function trackPoint(', 'let plans=[];'),
 ].join('\n'),r.context);
 r.geom=(line,a,b)=>{Object.assign(r.context,{testLine:line,testA:a,testB:b});return vm.runInContext('geom(testLine,testA,testB)',r.context)};
 r.point=(line,a,b,k)=>{const g=r.geom(line,a,b);Object.assign(r.context,{testPlan:{seq:[r.context.byId.get(a),r.context.byId.get(b)],cum:[0,g.total],t:{line}},testDistance:g.total*k});return vm.runInContext('trackPoint(testPlan,testDistance)',r.context)};
 r.toLL=p=>new MercatorCoordinate(p.x,p.y).toLngLat().toArray();
 return r;
}
export function trainMeasurements(r,step=10){
 return Object.keys(r.raw).map((key,i)=>{
   const [line,sa,sb]=key.split(':'),a=+sa,b=+sb,g=r.geom(line,a,b),n=Math.max(1,Math.ceil(g.total/g.pts[0].meterInMercatorCoordinateUnits()/step)),coords=shifted(r.lines[i].geometry.coordinates,r.lines[i].properties.offset,r.zoom);
   let core=0,rendered=0,slot=0;
   for(let j=0;j<=n;j++){
     const q=r.point(line,a,b,j/n),p=r.toLL(q),unit=1/(512*2**r.zoom),display=r.toLL({x:q.x+q.r[0]*q.off*unit,y:q.y+q.r[1]*q.off*unit});
     core=Math.max(core,distance(p,coords));rendered=Math.max(rendered,distance(display,coords));slot=Math.max(slot,Math.hypot(...local(display,p)));
   }
   return {key,samples:n+1,coreM:core,renderedM:rendered,sharedSlotM:slot};
 });
}
