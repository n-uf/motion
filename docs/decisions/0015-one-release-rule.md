# 0015: One release rule for both drag models

*In progress: built on a branch, not yet on `live/motion`.*

A release reads the last frame: it lands the place that frame holds, else home. A frame names its held place in one
field. A frame draws its held place and nothing else.

## Context

`@n-uf/motion/drag` has two drag models: the drag intent (`createDragIntent`, a flat list of target rects) and the
landing model (`createLandingModel`, lanes of spots and open space). They answered "what does a release land on?" by two
rules.

- The landing model's release was already a read of its frame: `release` gives the frame's `held` place (a spot in a
  held lane, or the float in open space), else null.
- The drag intent worked the landing out a second time, beside the code that works out `shown`: the shown target, else
  the target under the pointer, drawn or not, else nothing. Every frame carried that second answer as `landing`.

So the intent could land on a place its frame never drew. A scripted fuzz over a mixed list (bar spots, a rail that
opens its room, a spring-loaded strip, a refusal, the float) found nothing shown and a release still landing in 29 % of
its frames, mostly fast ones: a pane flung at a place and let go before it showed landed there, and a release on a rail
in the 160 ms before it showed docked on it.

Dropping only the clause "under the pointer, drawn or not" was weighed and is not enough on its own: the intent's float
needed aim to show, so a fling into open space let go at once would have gone home in the intent, while the landing
model floats it (open space needs no aim there). Merging the two models into one was weighed and left: they answer
different questions (areas, and lanes of spots with the hand rule), a tiling drag runs the intent with every gate off,
and a docking drag runs the landing model. What is worth sharing is the release contract and one test of it on both.

## Decision

- **A release reads the last frame.** It lands the frame's held place, else nothing (the item goes home). It works
  nothing out again. At a point that differs from the last update's, the release takes that point as one more sample
  first, then reads the frame it gives. In the intent, keys that differ from the last update's do the same, so a key
  pressed or let go after the last frame still counts (keys left out are none held). The landing model's host calls
  `update` again with the same point when a key changes, so its last frame already has them. In the intent the held place is `shown`: the target the indicator shows, a held
  key's pick, and an armed spring-loaded target over home are all in that one field. In the landing model it is
  `held`.
- **The float needs no aim.** In the intent the float (a `free` target) is held whenever it is the pick under the
  pointer, at any speed, from the first such frame: neither the aim gate nor the switch hold applies to it. The aim exists
  to keep an indication steady; the float has none of its own, because the dragged item under the hand is its picture.
  Everything else about the float stays: the pointer must have left home, a refusal or a more precise target under the
  pointer still wins, and outside its `bounds` is nowhere.
- **A frame draws its held place and nothing else**, in the frame that holds it. The release rule is about the held
  place, never about what was drawn: the models do not know the preview mode.
- **One model decides a drag.** The two models stay two and need not pick the same place on the same geometry: what
  makes a frame hold a place (the intent's aim, the landing model's entry gates) differs by design.

`DragFrame.landing` is removed: the frame's `shown` is the one field.

## Consequences

- In the intent a target under the pointer that the frame does not hold is no landing: a pane let go over a place before
  it showed goes home, and so does a release on an `opensRoom` target before it shows. A fling into open space still
  floats, and in Outline, Placeholder and Glide the float's marker now shows at any speed.
- The landing model does not change. A tiling drag (the hit's options turn every gate off) should not change: with no
  home and no time gate the held place is what lies under the pointer from the first frame.
- The intent has one gap left in the drawing rule: a slotted target in Glide or Snap is held from the frame it shows but
  draws nothing until its room opens, `roomAfter` (160 ms) later, and a release in that window lands on it. It is closed
  in a later step by opening the room with the held place, every delay moved before the place is held.
- Guarded by `test/release-rule.test.ts`, four properties run on both models over one stand-in geometry (a bar of spots,
  an owning rail over home, a refusing column, open space) on seeded random walks at 0 to 6 px/ms with rests and held
  keys: the release reads the frame (and a release at a new point equals an update there, then the read); the float needs
  no aim; only the held place is drawn, never a refusal; held is drawn at once. The last counts the intent's Glide and
  Snap frames that wait for their room and reports them instead of failing; once the gap is closed it fails on them.

## Date

2026-11-23.
