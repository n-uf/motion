- **A release sample under 1 ms after the last frame no longer changes the place.** The landing model's hand speed read
  the few pixels such a sample moved over 1 ms (the shortest interval it divided by), a third of the real speed or less,
  so a hand flicked down a lane read slow on its release sample and the held spot could switch on it, 100 px or more
  from the spot the last frame held. An interval under 1 ms is now the same sample: it keeps the previous step and
  speed, as a repeated point does. The same place and release point give the same landing at any sample rate.
