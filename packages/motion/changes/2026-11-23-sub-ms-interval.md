- **A release sample stamped under 1 ms after the last frame no longer changes the place.** The landing model's hand
  speed read the few pixels such a sample moved over 1 ms (the shortest interval it divided by), a third of the real
  speed or less, so a hand flicked down a lane read slow on its release sample and the held spot could switch on it,
  100 px or more from the spot the last frame held. A sample stamped under 1 ms past the newest one the hand holds is
  now the same sample: it is left out, so the step, the speed and the steadiness read as they did before it (a gap a
  coarse clock rounds up to 1 ms is a step, as before). In a run of samples all stamped under 1 ms apart (a host
  sampling above 1 kHz) the first one that lies 1 ms or more past the newest held is read over its whole interval, so
  the step and the speed follow the hand: a fling and then a slow creep, both sampled every 0.5 ms, reads slow once the
  creep has lasted the span, and a slide enters a touching lane at 2 and 8 kHz as it does at 1 kHz. A sample stamped
  before the newest one held (an event's time against a frame's; the times of one drag are expected from one clock) is
  left out the same way, however far behind: one late stamp changes nothing. Only a run of such samples that starts 40 ms
  or more behind and goes on for 20 ms with no in-order sample between is a clock that stepped back, and the hand
  starts again from the sample that ends it.
