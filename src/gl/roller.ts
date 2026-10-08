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
import { Group, Mesh } from "three/webgpu";

import { columnX } from "./sheet-metrics";

const MODEL = "/models/roller.glb";

/** three's GLTFLoader runs every node name through `sanitizeNodeName`, which
 * turns whitespace into underscores. The GLB says "Type Guide"; by the time it
 * is in the scene graph it answers to this. */
const TYPE_GUIDE = "Type_Guide";
const ALIGNMENT_SCALE = "Alignment_Scale";

/** How hard the guide chases the carriage across a line. Stiff: a typebar
 * lands the instant you press the key, and so should the mark saying where. */
const COLUMN_STIFFNESS = 38;
/** Softer down the page, so a carriage return reads as a machine moving
 * rather than the scale teleporting. */
const LINE_STIFFNESS = 16;

export interface Roller {
  readonly group: Group;
  /** The column the next character will land in. */
  readonly setColumn: (column: number) => void;
  /** How far the line being typed sits from the assembly's resting height. */
  readonly setLineOffset: (offset: number) => void;
  readonly update: (dt: number) => void;
}

/** Exponential approach, framerate-independent. */
const chase = (at: number, target: number, stiffness: number, dt: number) =>
  at + (target - at) * (1 - Math.exp(-stiffness * dt));

export const loadRoller = async (): Promise<Roller> => {
  const gltf = await new GLTFLoader().loadAsync(MODEL);
  const group = gltf.scene;

  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    // The platen takes the shadow of the sheet curling over it.
    object.receiveShadow = true;
  });

  const guide = group.getObjectByName(TYPE_GUIDE);
  const scale = group.getObjectByName(ALIGNMENT_SCALE);

  // The scale and the guide travel together: the scale marks the line, the
  // guide marks the character on it. Everything else is bolted to the frame.
  const carriage = new Group();
  if (guide && scale) {
    carriage.add(scale, guide);
    group.add(carriage);
  } else {
    console.warn(`${MODEL} is missing its carriage parts; the printing point will not move`);
  }

  let columnTarget = columnX(0);
  let columnAt = columnTarget;
  let lineTarget = 0;
  let lineAt = 0;

  return {
    group,
    setColumn: (column) => {
      columnTarget = columnX(column);
    },
    setLineOffset: (offset) => {
      lineTarget = offset;
    },
    update: (dt) => {
      if (!guide) return;
      columnAt = chase(columnAt, columnTarget, COLUMN_STIFFNESS, dt);
      lineAt = chase(lineAt, lineTarget, LINE_STIFFNESS, dt);
      guide.position.x = columnAt;
      carriage.position.y = lineAt;
    },
  };
};
