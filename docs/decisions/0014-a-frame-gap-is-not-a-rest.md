# 0014: A frame gap is not a rest

*In progress: built on a branch, not yet on `live/motion`.*

A gap between two pointer samples is a rest only when the model saw the pointer rest: a repeated sample shows it
standing still, or the pointer moved across the gap at well under the hand's speed. A gap the pointer moved on through
is frames the host lost, and the hand's speed carries on through it as if they had come.

## Context

The landing model's gates that ask "fast or slow" read one estimate, the hand's speed (`createHandSpeed`). A slide from a
held lane into a lane that touches it (a toolbar slid round the corner from a bar down a rail) counts only while the
hand reads steady, which takes a span and a half of samples (about 120 ms at 60 Hz). Until the slide has counted `path`
(40 px), the held lane holds; more than `exit + path` (52 px) past it, the frame is held but refused, and a release goes
home.

The hand started again at any gap of 40 ms or more (`HAND_SPEED.gap`, or `pause` if smaller), so that a rest is never
averaged into the fling after it. A single late frame during a slide is such a gap. It threw the hand's history away, so
the slide stopped counting for another 120 ms while the pointer moved on past `exit + path`. A toolbar slid round a
corner at 1.44 px/ms and let go at once went home in about one run in ten where one 44 to 50 ms frame came in 3% of
frames; without gaps it docked every time.

Three ways were weighed:

- **Judge a gap by the displacement across it.** A pointer that moved across the gap at about its speed was moving. On
  its own it is not enough: a patch that kept the hand when the step across the gap read within 1.5 times the last step
  still failed with timestamps off by half a frame (the last step reads anywhere from half to many times the hand's
  speed then), and a hand with no span read yet still started again at every early gap. Nor is displacement enough to
  tell a rest from a lost stretch: a creep, a rest of 100 ms, then a fling whose first frame covers 50 px moves across the
  gap at more than half the creep's speed.
- **Make the slide's continuity rest on the lanes the pointer stayed inside**, not on the hand reading steady. The slide
  still has to be judged slow at the moment it enters, and right after a gap there is nothing to judge it by but single
  steps, which a jittered fling reads below 2 px/ms on some frames. It moves the problem rather than removing it.
- **Tell a rest from a lost stretch by what the model saw**, and carry the hand on through a lost stretch. A host that
  updates per frame reports a rest as it happens (repeated samples), and one that updates per pointer sample is asked to
  call once more `rest` ms after the pointer stops, so that it can become still: either way a rest the model can act on
  is a rest it saw. A dropped frame reports nothing. This is the rule chosen, with the displacement as the fallback for a
  gap the model saw nothing in.

Carrying the hand on is not enough alone either. The span the hand reads (`long`) holds at least 5 steps, so one step
across a gap that stands for five frames delays it by four; and the slide counted only steps from a point inside the
touching lane, so a gap across the lane's edge lost its part inside the lane. The lost frames are filled in, and the
count starts where the pointer crossed into the lane.

## Decision

A gap of `gap` ms or more between two distinct samples (40, or the landing model's `pause` if smaller) is:

- **a rest** when the pointer was seen standing still in it for `still` ms (20, or the model's `rest` if smaller: a
  repeated sample that long after the last move; a host that updates per frame sends one within the frame of a move,
  which is no rest), or moved across it at under `carry` (0.5) times the hand's speed so far (`long`, else the mean over
  the samples held), or the hand has no speed yet (one sample). The hand starts again, as before.
- **a lost stretch** otherwise. The hand carries on: the frames lost are filled in on a straight line at the mean speed
  across the gap, a frame being the longest interval held (so a jittered frame never fills in more frames than were
  lost, and the span still holds 5 frames of real time). An interval shorter than the gap but `fill` (2.5) frames or
  more long, the pointer not seen resting in it, is filled in the same way.

Either way the step across a gap is unknown (`step` is Infinity) unless it is no longer than `slowStep` (3) px: it may
end a rest, so it is never a slow step, and the still, over-refused and slow-path gates never fire on it. Across a lost
stretch `speed` and `steady` read the gap's mean, so a slide counts on through it.

A touching lane's slide counts from where the pointer crossed into the lane: the step that enters adds its part inside
the lane, along and across.

The property that pins it (`test/landing-frame-gap.test.ts`): from the bar's corner up a touching rail at a constant
speed, at 125 and 60 Hz, timestamps exact or off by up to half a frame, one gap of 33 to 100 ms after any frame gives
a release the verdict the drive without it gives. A slide (0.8 to 1.6 px/ms, clear of `slideSpeed` by the hand's error)
docks no later than one frame after the drive without the gap (three with jittered timestamps, as the gap drops
jittered samples too); a fling (2.4 px/ms or faster) never docks. A slide may dock earlier by up to the gap's own frames:
the model credits the gap's travel when it ends.

## Consequences

- A slide round a corner with one late frame docks where it did without it. The host's case (1.44 px/ms, one frame of
  44 to 50 ms anywhere, let go at once) docks in every run.
- A rest the host reports still starts the hand again, and a fling after it is no entry; a rest of `pause` still enters a
  lane (`landing-frame-gap.test.ts` (b) and (c); the hand-speed sweep is unchanged).
- The host's part is sharper: call `update` again `rest` ms or more after the pointer stops (every frame does). A host
  that sends nothing while the pointer rests is judged by the displacement alone: a creep, an unreported rest, then a
  fling whose first frame covers at least half what the creep would have over the gap reads as one stroke, and can take
  a touching lane on that frame.
- The slide counting from the lane's edge moves two recorded drives: a hand that goes up a rail into the top bar and
  turns along it now counts the across part of the step that entered the bar, so the bar takes it a frame or three later
  (`landing-lane-to-lane` and `landing-across-items` in the motion landing frames, both stretch modes).
- A host sampling slower than 25 Hz (every step a gap, the hand with no speed yet) slides into a touching lane only by
  its own gates, as before.
- Guarded by `test/hand-speed.test.ts` (a rest seen, a rest by displacement, a lost stretch carried on, a second-copy
  oracle of the rule over 2000 random gaps) and `test/landing-frame-gap.test.ts`.

## Date

2026-11-23. The release is named here when it ships.
