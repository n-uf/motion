- **The tiling drag's internal map names its types explicitly.** The map that remembers each held place's result was
  created without type arguments and so held `any`; it now says `Map<K, TilingAfter<T, K>>`. Nothing a consumer sees
  changes: the built code and the types are as they were.
