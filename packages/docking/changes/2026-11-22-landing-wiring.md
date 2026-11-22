### The drag is the landing model's whole wiring

- **Added: `DockDrag.home`**, the item's own place at the lift, `{ lane, spot }` (the first spot `lanes()` marks `home`;
  absent for a float). So `createLandingModel({ ...dockDrag(...), preview })` is the whole wiring. Old: the host scanned
  `drag.regions.lanes[].spots[].home` for it and passed `home` by hand; a host that still passes its own `home` after the
  spread keeps working (its value wins), and a host that passed none now gets the drag's.
- `./testing`, **changed (breaking, type only): `LandingRule`'s options carry `preview` in place of `placeGuides`**
  (`{ mode, placeGuides? }`, motion's `DragPreview` shape), and `createLandingHost` hands the rule the drag as it is
  (`{ ...drag, preview }`, its `home` included). `createLandingModel` from `@n-uf/motion/drag` is a rule as before.
- `./testing`: the reference host keeps a private copy of the refusal rank (2.5), as it can't import it any more from
  `@n-uf/placement`, which dropped it (see its changelog). The reference pick is unchanged and a test holds it equal to
  motion's `targetAt`.
