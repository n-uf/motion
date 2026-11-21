- `./stack`, **added: `fitFloat(want, stage, avoid, { stay: true })`** (`FloatFitOptions`): the float is only moved
  inside the stage, never beside what it covers; `covers` lists every `avoid` rect it covers there and `snapped` is
  false. For a float a person left over content on purpose. Without the option every fit is as before.
