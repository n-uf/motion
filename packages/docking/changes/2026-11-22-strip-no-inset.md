- Added: **`DockItem.countsAsDocked`, so a side strip no longer switches on the inset of `insetWhen: "docked"`.** The
  declaration says whether an item counts as a docked panel; left out, the old rule holds (not closed, not fixed, its first
  column form `open`, `header` or `rail`). It overrides that either way: `false` on a narrow column that only moves the
  content aside leaves the inset off while it is open alone, so the content is the stage's less the strip's width and the
  strip lies flush at the window's side; `true` counts an item of another form. With a docked panel open as well the
  inset is on, as before. It is a declaration like `pushable`: `readDockState` takes it from `base`, `storeDockState`
  never writes it. A state that declares none lays out exactly as before.
