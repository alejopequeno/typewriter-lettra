/**
 * What turns the render into a photograph.
 *
 * A lens has a focal plane, a sensor has grain, and a barrel darkens its own
 * corners. Without those the scene reads as geometry lit correctly, which is
 * exactly what it looked like before this existed.
 */

import {
  float,
  nodeObject,
  pass,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import {
  RenderPipeline,
  type Camera,
  type Node,
  type Renderer,
  type Scene,
} from "three/webgpu";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";

/** How far past the focal plane something is fully gone, in world units. */
const FOCAL_LENGTH = 1.15;
const BOKEH_SCALE = 1.1;

/** Paper does not glow, and lit paper sits well above 1 in linear terms. A
 * threshold anywhere near it bleeds the page over its own text and turns the
 * ink grey, so this is set high enough that only a specular reaches it. */
const BLOOM_STRENGTH = 0.04;
const BLOOM_RADIUS = 0.65;
const BLOOM_THRESHOLD = 2.1;

const GRAIN = 0.045;

/** Where the corners start losing light, and how much they lose. */
const VIGNETTE_START = 0.32;
const VIGNETTE_END = 0.86;
const VIGNETTE_DEPTH = 0.34;

type ColourNode = Node<"vec4">;

/**
 * The display effects in `three/examples` extend `TempNode`, which
 * `@types/three` declares as `Node<unknown>`: the type never states that they
 * output a colour, so the fluent `.rgb` and `.add` are missing from it. Every
 * one of them does output a colour. Saying so once here beats casting at each
 * call site, and keeps the unsoundness to a single line.
 */
const asColour = (node: Node): ColourNode =>
  nodeObject(node) as unknown as ColourNode;

export interface Post {
  readonly render: () => void;
  /** Distance from the camera to whatever should be sharp. */
  readonly focusOn: (distance: number) => void;
  readonly dispose: () => void;
}

export interface PostOptions {
  readonly renderer: Renderer;
  readonly scene: Scene;
  readonly camera: Camera;
}

export const createPost = ({ renderer, scene, camera }: PostOptions): Post => {
  const focusDistance = uniform(1.6);

  const scenePass = pass(scene, camera);
  const colour = scenePass.getTextureNode("output");
  const viewZ = scenePass.getViewZNode();

  const focused = asColour(
    dof(colour, viewZ, focusDistance, float(FOCAL_LENGTH), float(BOKEH_SCALE)),
  );

  const lit = focused.add(
    asColour(bloom(focused, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)),
  );

  // No chromatic aberration here. On strokes this thin the red and blue taps
  // land on paper while green lands on ink, and every letter turns magenta.
  // Squashed on y so the falloff follows the frame rather than a circle.
  const fromCentre = screenUV.sub(0.5).mul(vec2(1, 0.82)).length();
  const corners = smoothstep(VIGNETTE_END, VIGNETTE_START, fromCentre)
    .mul(VIGNETTE_DEPTH)
    .add(1 - VIGNETTE_DEPTH);
  const vignetted = vec4(lit.rgb.mul(corners), lit.a);

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = asColour(film(vignetted, float(GRAIN)));

  return {
    render: () => pipeline.render(),
    focusOn: (distance) => {
      focusDistance.value = distance;
    },
    dispose: () => pipeline.dispose(),
  };
};
