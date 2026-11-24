- **Breaking: one release rule for both drag models.** The drag intent's `release` now reads the last frame, as the
  landing model's does: it lands the frame's held place (`shown`), else null (home). The second check it made ("else the
  target under the pointer, drawn or not") is gone, so a target the frame does not hold is no landing: a pane let go over
  a place before it showed, or on an `opensRoom` target before it shows, goes home. `DragFrame.landing` is removed: read
  `shown`, which holds the shown target, a held key's pick and an armed spring-loaded target over home. The float (a
  `free` target) needs no aim: it is held whenever it is the pick under the pointer, at any speed, from the first such
  frame (no aim gate, no switch hold), so a fling into open space still floats and its marker shows at any speed. Home,
  refusals, more precise targets and the float's `bounds` decide the pick as before. Decision record 0015.
