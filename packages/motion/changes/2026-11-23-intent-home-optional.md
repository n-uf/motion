- `./drag`, **changed (additive): `createDragIntent`'s `home` is optional.** Leave it out when the targets hold the
  item's own place themselves, as a tiling drag's hit does (`hit.intent` passes none): the pointer has left home from
  the first sample, `atHome` is never true, a release lands on what is under the pointer and `moveHome` does nothing.
  An intent with a `home` works as before.
