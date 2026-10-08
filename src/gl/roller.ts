/**
 * The hardware that holds the sheet: the platen the paper wraps over, its
 * flanges and knurled knobs, and the bail bar that presses the page flat.
 *
 * Modelled in Blender and exported at the scene's own scale, so it drops in at
 * scale 1 with nothing to convert. The source is `tools/blender/roller.py`;
 * rerun that to change the shape. The procedural cylinders this replaced are
 * in the history if they are ever wanted back.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Group, Mesh } from "three/webgpu";

const MODEL = "/models/roller.glb";

export const loadRoller = async (): Promise<Group> => {
  const gltf = await new GLTFLoader().loadAsync(MODEL);

  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    // The platen takes the shadow of the sheet curling over it.
    object.receiveShadow = true;
  });

  return gltf.scene;
};
