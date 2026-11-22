- Changed (breaking for a conformance host): **`@n-uf/docking/testing` row C1 expects no `[data-drag-marker]`.** A gap or
  strip landing draws one mark, the slot (`[data-drag-slot][data-drag-target]`), so a page that also drew an insertion
  line from `DockDrop.marker` now fails the row: draw the slot only. `DockDrop.marker` stays, as data.
