- **The tiling drag's internal maps name their types explicitly.** The maps that remember each held place's result were
  created with a plain `new Map()`, whose own type is `Map<any, any>`; each is now created as `Map<K, TilingAfter<T, K>>`.
  Nothing a consumer sees changes: the built code and the types are as they were.
