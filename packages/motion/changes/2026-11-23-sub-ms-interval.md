- **A release sample under 1 ms after the last frame no longer changes the place.** The landing model's hand speed read
  the few pixels such a sample moved over 1 ms (the shortest interval it divided by), a third of the real speed or less,
  so a hand flicked down a lane read slow on its release sample and the held spot could switch on it, 100 px or more
  from the spot the last frame held. A sample under 1 ms past the newest one the hand holds is now the same sample: it
  is left out, so the step, the speed and the steadiness read as they did before it. In a run of samples all under 1 ms
  apart (a host sampling at 2 kHz or more) the first one that lies 1 ms or more past the newest held is read over its
  whole interval, so the step and the speed follow the hand: a fling and then a slow creep, both sampled every 0.5 ms,
  reads slow once the creep has lasted the span.
