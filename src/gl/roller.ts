/**
 * The hardware that holds the sheet: the platen the paper wraps over, its
 * flanges and knurled knobs, the bail bar that presses the page flat, and the
 * carriage assembly — the alignment scale and the type guide that marks the
 * exact printing point.
 *
 * Modelled in Blender and exported at the scene's own scale, so it drops in at
 * scale 1 with nothing to convert. The source is `tools/blender/roller.py`;
 * rerun that to change the shape.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Group, Material, Mesh } from "three/webgpu";

import { createHardwareMaterials } from "./materials/hardware-materials";
import { columnX } from "./sheet-metrics";

const MODEL = "/models/roller.glb";

/** three's GLTFLoader runs every node name through `sanitizeNodeName`, which
 * turns whitespace into underscores. The GLB says "Type Guide"; by the time it
 * is in the scene graph it answers to this. */
const TYPE_GUIDE = "Type_Guide";

/** How hard the guide chases the carriage across a line. Stiff: a typebar
 * lands the instant you press the key, and so should the mark saying where. */
const COLUMN_STIFFNESS = 38;

export interface Roller {
  readonly group: Group;
  /** The column the next character will land in. */
  readonly setColumn: (column: number) => void;
  readonly update: (dt: number) => void;
}

/** Exponential approach, framerate-independent. */
const chase = (at: number, target: number, stiffness: number, dt: number) =>
  at + (target - at) * (1 - Math.exp(-stiffness * dt));

export const loadRoller = async (): Promise<Roller> => {
  const [gltf, surfaces] = await Promise.all([
    new GLTFLoader().loadAsync(MODEL),
    createHardwareMaterials(),
  ]);
  const group = gltf.scene;

  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    // The platen takes the shadow of the sheet curling over it.
    object.receiveShadow = true;

    // The GLB's materials are flat constants; swap in the worn ones by name.
    const current: unknown = object.material;
    const name =
      current instanceof Material ? current.name : undefined;
    const worn = name === undefined ? undefined : surfaces.get(name);
    if (worn) object.material = worn;
  });

  // The only part that moves. The scale it rides in is bolted to the frames,
  // and the paper is what travels past both.
  const guide = group.getObjectByName(TYPE_GUIDE);
  if (!guide) {
    console.warn(`${MODEL} has no "${TYPE_GUIDE}"; the printing point will not move`);
  }

  let target = columnX(0);
  let at = target;

  return {
    group,
    setColumn: (column) => {
      target = columnX(column);
    },
    update: (dt) => {
      if (!guide) return;
      at = chase(at, target, COLUMN_STIFFNESS, dt);
      guide.position.x = at;
    },
  };
};
