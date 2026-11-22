- Breaking: **the root `Target` shrinks to a shape of places.** It is now `id`, `priority`, `hit`, `hits`, `slot`, `label`,
  `free`, `refuse` and `bounds`, and carries no time and no timing. Five fields leave it, each now on `@n-uf/docking`'s
  `DockDrop` (and, as before, on `@n-uf/motion/drag`'s `DragTarget`, which is the shape a drag intent reads):
  `arm: "dwell"` (spring-loaded), `armedHit` (its zone once armed), `opensRoom` (its room opens as it shows), `roomHold`
  (ms) and `roomHit` (the zone it holds once its room is open). A host that built a root `Target` with one of them types
  it as a `DragTarget` (or a `DockDrop`) instead; `paneTargets`, `orderTargets` and `stackGaps` never set them. No
  behavior changes: every target, drop, landing frame and fit is as before.
