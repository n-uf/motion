- Breaking: **`DockDrop` now carries the spring-loading and room fields itself.** `arm: "dwell"`, `armedHit`,
  `opensRoom`, `roomHold` (ms) and `roomHit` used to come with placement's root `Target`, which now holds only `id`,
  `priority`, `hit`, `hits`, `slot`, `label`, `free`, `refuse` and `bounds`; they are declared on `DockDrop`, with the same
  names, types and values on every target (`DockRefusalTarget` has none of them, as before). Only a drag intent
  (`@n-uf/motion/drag`'s `createDragIntent`) reads them; the landing model and `dockDrag` never do. `EDGE_ROOM_HOLD` and
  `RailDropPolicy.magnet` are unchanged. No behavior changes.
