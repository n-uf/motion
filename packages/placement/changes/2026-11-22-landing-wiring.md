- **Removed (breaking): `pickRank` and `REFUSAL_RANK`.** `@n-uf/motion/drag` owns the pick's rank (it is the one that picks:
  `targetAt`); placement read it nowhere itself. A host that imported them from here imports them from
  `@n-uf/motion/drag` (the same values: a refusal ranks 2.5, a target its priority). `Target` is unchanged, and its
  `refuse` field still marks a refusal.
