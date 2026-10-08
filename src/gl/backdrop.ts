/**
 * The wall behind the machine.
 *
 * Without it the sheet hangs in a black void and reads as a cutout. A surface
 * back there gives the lamp something to fall off against, gives the page
 * somewhere to throw its shadow, and gives the depth of field something to
 * actually blur.
 */

import { color, mix, mx_fractal_noise_float, positionLocal, vec3 } from "three/tsl";
import { Mesh, MeshStandardNodeMaterial, PlaneGeometry } from "three/webgpu";

import { CURL_TANGENT_Y, INCH } from "./sheet-metrics";

const WIDTH = 7;
const HEIGHT = 5;
/** Far enough back that it is well outside the focal plane. */
const DISTANCE = 1.15;

const WALL_LIGHT = "#211b15";
const WALL_DARK = "#0a0806";

/** Just enough to read as a surface. Any more and the depth of field
 * smears it into blobs that draw the eye off the page. */
const TOOTH_SCALE = 1 / (0.6 * INCH);
const TOOTH_STRENGTH = 0.025;

export const createBackdrop = (): Mesh => {
  const material = new MeshStandardNodeMaterial();

  const tooth = mx_fractal_noise_float(
    vec3(
      positionLocal.x.mul(TOOTH_SCALE),
      positionLocal.y.mul(TOOTH_SCALE),
      0,
    ),
    3,
    2,
    0.5,
    1,
  ).mul(TOOTH_STRENGTH);

  // Darker towards the bottom, where the machine would be sitting.
  const height = positionLocal.y.div(HEIGHT).add(0.5).clamp(0, 1);
  material.colorNode = mix(color(WALL_DARK), color(WALL_LIGHT), height).add(
    vec3(tooth.mul(height)),
  );
  material.roughness = 0.95;
  material.metalness = 0;

  const mesh = new Mesh(new PlaneGeometry(WIDTH, HEIGHT), material);
  mesh.position.set(0, CURL_TANGENT_Y - HEIGHT * 0.22, -DISTANCE);
  mesh.receiveShadow = true;
  return mesh;
};
