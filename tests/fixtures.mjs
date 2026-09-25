// Network data for tests, read from the page (the same data the map uses).
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const block=id=>JSON.parse(html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1]);
export const stations=block('stationData'),paths=block('linePaths');
export const kst=iso=>new Date(iso);   // ISO strings below carry +09:00
