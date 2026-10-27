// A small Mapbox Vector Tile reader for the city's build worker: decodes only the layers asked for, and gives them
// the shape the mesh builder reads (layer.length, layer.extent, layer.feature(i) → {id, properties, type,
// loadGeometry()}), the same as MapLibre's parsed tiles on the main thread. Rings come back closed (the first
// point again at the end), as MapLibre's do.

// 속성 값 하나(글자 · 숫자 · 참거짓, 없으면 null) · 점 하나(타일 좌표)
export type MvtValue = string | number | boolean | null;
export interface MvtPoint { x:number; y:number }

const TD = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
class Pbf {
  declare b:Uint8Array; declare pos:number; declare dv:DataView;
  constructor(buf:ArrayBuffer | Uint8Array) { this.b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); this.pos = 0; this.dv = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength) }
  varint():number {   // up to 64 bits (exact to 2^53)
    const b = this.b; let v = b[this.pos++]!; if (v < 0x80) return v; v &= 0x7f; let s = 7, c:number;
    do { c = b[this.pos++]!; if (s < 28) v |= (c & 0x7f) << s; else v += (c & 0x7f) * 2 ** s; s += 7 } while (c >= 0x80);
    return v;
  }
  svarint():number { const v = this.varint(); return v % 2 === 1 ? -(v + 1) / 2 : v / 2 }   // zigzag (safe for the 64-bit path too: v stays a Number)
  skip(type:number):void { if (type === 0) { while (this.b[this.pos++]! >= 0x80); } else if (type === 2) this.pos += this.varint(); else if (type === 5) this.pos += 4; else if (type === 1) this.pos += 8; else throw Error('pbf: wire type ' + type) }
  bytes():[number, number] { const n = this.varint(), s = this.pos; this.pos += n; return [s, this.pos] }
  string():string { const [s, e] = this.bytes(); return TD ? TD.decode(this.b.subarray(s, e)) : String.fromCharCode(...this.b.subarray(s, e)) }
}
function readValue(p:Pbf, end:number):MvtValue {
  let v:MvtValue = null;
  while (p.pos < end) {
    const tag = p.varint(), f = tag >> 3, t = tag & 7;
    if (f === 1) v = p.string(); else if (f === 2) { v = p.dv.getFloat32(p.pos, true); p.pos += 4 } else if (f === 3) { v = p.dv.getFloat64(p.pos, true); p.pos += 8 }
    else if (f === 4 || f === 5) v = p.varint(); else if (f === 6) v = p.svarint(); else if (f === 7) v = !!p.varint(); else p.skip(t);
  }
  return v;
}
class Feature {
  declare layer:Layer; declare s:number; declare e:number; declare id:number | undefined; declare type:number; declare properties:Record<string, MvtValue>; declare g:[number, number] | null;
  constructor(layer:Layer, s:number, e:number) { this.layer = layer; this.s = s; this.e = e; this.id = undefined; this.type = 0; this.properties = {}; this.g = null;
    const p = new Pbf(layer.buf); p.pos = s;
    while (p.pos < e) {
      const tag = p.varint(), f = tag >> 3, t = tag & 7;
      if (f === 1) this.id = p.varint();
      else if (f === 2) { const [a, b] = p.bytes(); const q = new Pbf(layer.buf); q.pos = a; while (q.pos < b) { const k = layer.keys[q.varint()]!, v = layer.values[q.varint()]!; this.properties[k] = v } }
      else if (f === 3) this.type = p.varint();
      else if (f === 4) this.g = p.bytes();
      else p.skip(t);
    }
  }
  loadGeometry():MvtPoint[][] {
    const out:MvtPoint[][] = []; if (!this.g) return out;
    const p = new Pbf(this.layer.buf); p.pos = this.g[0]; const end = this.g[1];
    let x = 0, y = 0, cmd = 0, len = 0, line:MvtPoint[] | null = null;
    while (p.pos < end) {
      if (len <= 0) { const c = p.varint(); cmd = c & 7; len = c >> 3 }
      len--;
      if (cmd === 1 || cmd === 2) { x += p.svarint(); y += p.svarint(); if (cmd === 1) { if (line) out.push(line); line = [] } line!.push({ x, y }) }
      else if (cmd === 7) { if (line && line.length) line.push({ x: line[0]!.x, y: line[0]!.y }) }
      else throw Error('mvt: command ' + cmd);
    }
    if (line) out.push(line);
    return out;
  }
}
class Layer {
  declare buf:Uint8Array; declare name:string; declare extent:number; declare version:number; declare keys:string[]; declare values:MvtValue[]; declare f:[number, number][]; declare length:number;
  constructor(buf:Uint8Array, s:number, e:number) {
    this.buf = buf; this.name = ''; this.extent = 4096; this.version = 1; this.keys = []; this.values = []; this.f = [];
    const p = new Pbf(buf); p.pos = s;
    while (p.pos < e) {
      const tag = p.varint(), f = tag >> 3, t = tag & 7;
      if (f === 15) this.version = p.varint(); else if (f === 1) this.name = p.string(); else if (f === 2) this.f.push(p.bytes());
      else if (f === 3) this.keys.push(p.string()); else if (f === 4) { const [a, b] = p.bytes(); const q = new Pbf(buf); q.pos = a; this.values.push(readValue(q, b)) }
      else if (f === 5) this.extent = p.varint(); else p.skip(t);
    }
    this.length = this.f.length;
  }
  feature(i:number):Feature { const [s, e] = this.f[i]!; return new Feature(this, s, e) }
}
export type { Layer, Feature };
// decodeTile(arrayBuffer, wanted?: Set<string>) → {layerName: Layer}
export function decodeTile(buffer:ArrayBuffer | Uint8Array, wanted?:Set<string> | null):Record<string, Layer> {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), p = new Pbf(buf), out:Record<string, Layer> = {};
  while (p.pos < buf.length) {
    const tag = p.varint(), f = tag >> 3, t = tag & 7;
    if (f === 3) { const [s, e] = p.bytes(); const L = new Layer(buf, s, e); if (!wanted || wanted.has(L.name)) out[L.name] = L } else p.skip(t);
  }
  return out;
}
