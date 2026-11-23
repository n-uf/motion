- Fixed: **no guide lies over a movable grower while another item is held beside it.** The marks read a grower as the
  frame draws it: in a held place's layout, its release's commit, it has taken its bar's free stretch, so the box and
  hatch of the place after it are cut there, not where its natural length ends. A growing fixed title's slack stays free
  room for the marks, as before. Drop room still counts a grower at its natural length.
- Fixed: **a movable grower floats at its natural size, under the hand.** A form that grows without a body (a toolbar
  that grows on a bar) is not sized by hand (`sizedByHand`: a form that grows and shows a body, a panel's card): its
  float takes its `floatSizes` or its natural size, never `DEFAULT_FLOAT_SIZE` or a rect left from its grown length, and
  `fitResize` and `orientFloat` treat it as a toolbar group: a float of a movable toolbar grower is not resizable by hand
  (`fitResize` gives null), since its size comes from its forms. A float of it keeps the hand's share of the grown rect
  it was pressed on, so it lies under the pointer, and every frame of its drag lands as its release commits.
