# Train model refinement

Updated only the train-model section of `site/maplibre_runtime.mjs`. No deployment.

## Design

- Zooms 13–15 use a clean silver body, continuous line-colour rails, rounded cab corners and dark windscreens at both ends. Full-width dark joint marks are gone. Faint shoulder seams and roof hatches appear only when there is enough room.
- Body width eases from 6.8 CSS px at z13 through 7.77 at z14, 9.9 at z15 and 12.03 at z16 to 13 at z17+. This improves small-train proportions without a width jump.
- The compact representation is one rigid chord-aligned icon. Individual rigid cars begin at a car-length/body-width ratio of 1.5. Their articulation and 1.4 px gaps ease in through ratio 2.4; roof equipment, window rhythm and side detail also fade in with available space.
- High zoom retains the stainless EMU treatment: passenger windows, double doors, line-colour stripe, cab glass, roof HVAC, fans and applicable pantographs. Cab side facets now follow the rounded roof outline and raked height instead of leaving mismatched side slabs.
- LOD depends on each consist’s car length, so two- and three-car trains use the same rules without inheriting ten-car striping.

## Integration

The prefix and suffix outside the train-model markers were compared byte-for-byte with `baseline_runtime.mjs` and are unchanged. The original `lanePx` expression, right-hand lateral offset convention, true train length calculation and 22 px minimum are preserved. So are centre-relative `ox`/`oy` vertices, the origin folded into the matrix in double precision, premultiplied alpha, disabled depth testing, painter ordering and camera-facing walls. Bodies remain rigid; the compact icon approximates a curved track with its endpoint chord, then eases into the individual car chords.

No libraries, textures, external assets or additional draw calls were introduced. The reusable vertex buffer and two existing shadow/body passes remain. Station labels can still overlap trains; label placement was outside the permitted section.

## Verification

- `node --check site/maplibre_runtime.mjs` passed.
- Final `node shoot.mjs` completed with **no console errors**. Visually inspected the supplied Gangnam, Wangsimni, Seoul and Ui views, covering z13–18 and pitch 55°.
- `node verify.mjs` added intermediate z15.5/15.65/15.8/16 captures, pitch 60°, and z13/z17 views for 우이신설선, 신림선, 김포골드라인, 의정부선 and 인천2호선. All expected two-/three-car fixtures were present; no console errors and WebGL error code 0.
- `node detail.mjs` captured all five short consists at z18/pitch 60° with station labels temporarily hidden in the test page to inspect cabs, doors, joints and roof detail. No console errors. This does not change the application.
- The design detector returned no findings. Source assertions also checked the unchanged lane formula, origin precision, blend/depth state and length calculation.

Screenshots are in `shots/`. Useful examples: `gangnam-z13.png`, `gangnam-z15.png`, `transition-15.65.png`, `gangnam-z17-pitch55.png`, `sillim-detail.png`, and `incheon2-detail.png`. The original `shoot.mjs` is unchanged; the additional capture scripts and output logs are retained for reproduction.

## Performance evidence

`node perf.mjs` exercises 150 ten-car plans at pitch 60°. After five warmups, 30 geometry-generation samples per zoom gave these CPU medians:

| Zoom | Vertices per pass | Median CPU time |
| --- | ---: | ---: |
| 13 | 15,300 | 3.8 ms |
| 16 | 70,200 | 9.7 ms |
| 18 | 70,200 | 9.0 ms |

This microbenchmark substitutes no-op GL calls during timing; it measures JavaScript geometry generation, not GPU uploads, shading or end-to-end frame rate. Software-rendered Chromium reported no GL errors. Concurrent capture load produced p95 CPU samples of 17–24 ms, so these results do not certify sustained 60 fps on target hardware. Full measurements are in `perf-output.log`.
