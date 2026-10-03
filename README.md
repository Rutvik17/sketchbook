# Sketchbook

Places drawn in pencil and painted in watercolour. The first sketch fills the
screen: Nvidia's Voyager and Endeavor in Santa Clara from the air, drawn in
pencil, laid in with washes, and turned through a year of shots — seasons,
times of day, weather — with people walking, pods on the streets, drones and an
air taxi overhead.

It was a section of Sulba (`rutvik17/sulba`, at `/sketchbook`) until
Rutvik17/sulba@f1db7a2, and moved here as its own project.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # a static site in ./out
npm run typecheck
```

## How it is made

- **`src/lib/film` is the engine, framework-free canvas 2D.** `wash.ts` is the
  watercolour (glazes of a deformed polygon, a darkened drying edge),
  `pencil.ts` the hand-drawn line, `tools.ts` the pencil and brush seen at
  work, `campus.ts` the geometry — described once, sorted into ink, the
  `build` layer and the four seasons' layers — `life.ts`, `weather.ts` and
  `sky.ts` what moves and what falls, and `film.ts` the director: acts, shots,
  camera, compositing. Everything random is hashed (`random.ts`).
- **The campus is drawn to NVIDIA's own aerial photograph** ("Aerial View of
  NVIDIA Voyager and Endeavor", Gensler / Jason O'Rear, NVIDIA newsroom) and
  the buildings' published facts. Everything is placed on a plan in metres and
  projected through one camera (`proj` in `campus.ts`); never place a thing
  by eye on screen. Buildings hide what is behind them (`occluders`).
- **Shots are content.** Each is one object in `src/content/film.ts`: season,
  sky, glaze, how dark, how busy, what is falling, where the camera rests.
  Adding a shot needs no engine change.
- **Paint once, composite every frame.** What does not move is baked into a
  layer; the night is a `multiply` glaze over everything, and the lights go on
  top in `screen`. A change of season bleeds in through a mask of growing
  blots rather than cross-fading.
- **One line in the corner** (`components/Film.tsx`): what the hand is doing
  while the painting is made, then the place, with a heart painted beside it
  in Nvidia's green (`PaintedHeart.tsx`).
- **The cursor is the films' brush** (`components/Cursor.tsx`), laying a small
  wash under what it can act on.
- **Reduced motion:** no pencil, brush or timelapse — the finished painting,
  still, with every shot a button.

The painting is our own drawing, made in code; no photograph is reproduced.
"NVIDIA" is a trademark of NVIDIA Corporation. Caveat is used under the SIL
Open Font License 1.1.
