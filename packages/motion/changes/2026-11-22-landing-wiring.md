### Landing model: less to wire

- `./drag`, **changed (breaking): `createLandingModel`'s `placeGuides` option is now `preview`.** The guide level lives in
  one place, the preview, the same `DragPreview` (or `PreviewMode`) the host gives `previewPlan`: the model names its
  lanes by `guidesOf(preview)` (the preview's `placeGuides`, else its mode's default), so the level is stated once.
  Old: `createLandingModel({ ..., placeGuides: "near" })` beside `previewPlan(frame, { mode, placeGuides: "near" })`.
  New: `createLandingModel({ ..., preview })` and `previewPlan(frame, preview)`. With no `preview` the model uses the
  default preview, Glide, which asks for no guides, as the old default `"off"` did; a mode alone now brings its own
  default level (Snap and Placeholder near), as `previewPlan` already read it.
- `./drag`, **added: `guidesOf(preview)`**, the one reading of a preview's guide level (`previewPlan` reads it too; its
  plans are unchanged).
- `./drag`, **added: the landing model's `modifiers`** (`LandingModifiers` = `{ on, floatKey }`, default
  `LANDING_MODIFIERS`), the drag intent's `modifiers` shape less the arm key, in place of the fixed `keys.shift`. A variable
  holding the intent's `modifiers` passes as it is (an inline literal with `armKey` does not). The default is the intent's float key, Shift, so nothing moves unless a host sets it;
  `floatKey: "mod"` (⌘ or Ctrl) and the other keys now work, and `on: false` turns the key off. `frame.shift` says the
  float key is held.
- `./drag`, **removed (type only): `LandingRegions.item`.** The model never read it; `@n-uf/docking`'s regions keep
  theirs. A host that built regions with an `item` field drops it.
- `./drag`, **`pickRank` and `REFUSAL_RANK` have one owner: here.** `@n-uf/placement` no longer exports them (see its
  changelog); nothing changes for a host that imported them from `./drag`.
