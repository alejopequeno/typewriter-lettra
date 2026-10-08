/**
 * The hardware that holds the sheet: the platen the paper wraps over, its two
 * end knobs, and the bail bar that presses the page flat across the front.
 *
 * Procedural for now. When a modelled platen arrives it replaces the contents
 * of `createRoller` and nothing else moves.
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
} from "three/webgpu";

import {
  CURL_TANGENT_Y,
  INCH,
  PLATEN_RADIUS,
  ROLLER_RADIUS,
  SHEET_WIDTH,
} from "./sheet-metrics";

const PLATEN_LENGTH = SHEET_WIDTH * 1.18;
const KNOB_RADIUS = ROLLER_RADIUS * 1.3;
const KNOB_THICKNESS = 0.42 * INCH;
const BAIL_RADIUS = 0.05 * INCH;
const BAIL_DROP = 2.35 * INCH;
/** The bail stands off the page far enough to throw a readable shadow. */
const BAIL_STANDOFF = 0.26 * INCH;

/** Lying along x rather than the y that `CylinderGeometry` assumes. */
const horizontalCylinder = (
  radius: number,
  length: number,
  segments: number,
  material: MeshStandardNodeMaterial,
): Mesh => {
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, length, segments),
    material,
  );
  mesh.rotation.z = Math.PI / 2;
  return mesh;
};

export const createRoller = (): Group => {
  const group = new Group();

  const rubber = new MeshStandardNodeMaterial({
    color: "#3b332a",
    roughness: 0.5,
    metalness: 0.08,
  });
  const steel = new MeshStandardNodeMaterial({
    color: "#6a6155",
    roughness: 0.32,
    metalness: 0.95,
  });

  const platen = horizontalCylinder(PLATEN_RADIUS, PLATEN_LENGTH, 64, rubber);
  platen.position.set(0, CURL_TANGENT_Y, -ROLLER_RADIUS);
  platen.castShadow = true;
  group.add(platen);

  for (const side of [-1, 1]) {
    const knob = horizontalCylinder(KNOB_RADIUS, KNOB_THICKNESS, 48, steel);
    knob.position.set(
      (side * (PLATEN_LENGTH + KNOB_THICKNESS)) / 2,
      CURL_TANGENT_Y,
      -ROLLER_RADIUS,
    );
    knob.castShadow = true;
    group.add(knob);
  }

  // The bail bar rides in front of the page and is what casts the soft line
  // of shadow across the top of the sheet.
  const bail = horizontalCylinder(BAIL_RADIUS, SHEET_WIDTH * 1.04, 24, steel);
  bail.position.set(0, CURL_TANGENT_Y - BAIL_DROP, BAIL_STANDOFF);
  bail.castShadow = true;
  group.add(bail);

  for (const side of [-1, 1]) {
    const roller = horizontalCylinder(
      BAIL_RADIUS * 2.1,
      0.5 * INCH,
      24,
      rubber,
    );
    roller.position.set(
      side * SHEET_WIDTH * 0.26,
      bail.position.y,
      BAIL_STANDOFF - BAIL_RADIUS * 1.6,
    );
    roller.castShadow = true;
    group.add(roller);
  }

  return group;
};
