# Custom car model

How to bring your own GLB and use it instead of the default yellow truck (`models/vehicle-truck-yellow.glb`).

## Quick swap (same filename)

1. Export your car as **glTF 2.0 binary** (`.glb`).
2. Replace the file at **`models/vehicle-truck-yellow.glb`** (backup the original if you want it later).
3. Reload the game.

No code changes. The player car and the **best-lap ghost** both load that key from `js/main.js`.

## Use a new filename

1. Put the file under **`models/`**, e.g. `models/my-car.glb`.
2. In **`js/main.js`**, in the `modelNames` array, replace `'vehicle-truck-yellow'` with a name that matches your file **without** `.glb`, e.g. `'vehicle-my-car'` → `models/vehicle-my-car.glb`.

   Use a name that starts with **`vehicle-`**. Names with that prefix get the same **0.5 scale** applied as the Kenney trucks (Godot `root_scale` parity in `loadModels()`).

3. Replace every use of the old key with the new one:

   - `vehicle.init( models[ '…' ] )`
   - `new BestLapGhost( scene, mapParam, models[ '…' ] )`

If your asset must **not** be scaled by `0.5`, either rename it so it does not start with `vehicle-` and set scale yourself after load, or edit the `if ( name.startsWith( 'vehicle-' ) )` block in `loadModels()`.

## Hierarchy and object names (animation)

`Vehicle.init()` in **`js/Vehicle.js`** walks the loaded scene and hooks behavior by **lowercase node names**:

| Role | Name pattern | What the game does |
|------|----------------|---------------------|
| Chassis tilt | Exactly **`body`** | Pitch from acceleration, roll from steering, slight bounce |
| Wheels | Name contains **`wheel`** | Spin on **local X** with speed |
| Front-left / front-right steering | `wheel` + **`front`** + **`left`** / **`right`** | Steer on **local Y** |
| Rear wheels | `wheel` + **`back`** + **`left`** / **`right`** | Spin only |
| NOS front lift | Front left/right wheels | Small upward motion while boost is active |

If you skip these names, the car still **drives**; you only lose the extra motion on body and wheels.

**Blender tip:** Name empties or meshes (`body`, `wheel_front_left`, …). Export with hierarchy preserved.

## Forward direction and placement

Movement uses **+Z as forward** on the car’s root (see `Vehicle.update()`). After export, open the `.glb` in a viewer (for example [glTF Viewer](https://gltf-viewer.donmccurdy.com/)) and confirm the hood points along **+Z**. If steering feels reversed, rotate the model 180° around **Y** in your DCC tool and re-export.

The physics body is a **sphere** of radius **0.5** (see `createSphereBody` in **`js/Physics.js`**). The visual root is placed at the sphere center, then shifted down by **0.5** units on Y:

```291:295:js/Vehicle.js
		this.container.position.set(
			this.spherePos.x,
			this.spherePos.y - 0.5,
			this.spherePos.z
		);
```

If the wheels float or sink, adjust your model’s vertical placement (origin / mesh position) or change that **`- 0.5`** offset to match your art.

## Single mesh vs. scene

In **`js/main.js`**, if the GLB contains **exactly one** mesh, the loader stores that mesh alone. For a **body + four wheels**, keep separate objects (or a multi-mesh scene) so the full hierarchy is stored as `gltf.scene`. Otherwise wheel/body animation cannot target separate nodes.

## Textures and `ColorMapGLTFLoader`

**`js/Loader.js`** replaces textures only when the glTF references **`Textures/colormap.png`** (shared atlas). Custom materials that embed their own images keep them. You can still use the stock loader; no change required for a typical custom paint job.

## Checklist

- [ ] `.glb` under `models/`
- [ ] Name in `modelNames` starts with `vehicle-` if you want built-in 0.5 scale
- [ ] Optional: `body` + wheel node names for full animation
- [ ] +Z forward, origin / height tuned vs. sphere offset and ground
- [ ] `main.js`: same model key for `Vehicle` and `BestLapGhost`

After that, run the game from your usual static server (or open `index.html` per your setup) and drive.
