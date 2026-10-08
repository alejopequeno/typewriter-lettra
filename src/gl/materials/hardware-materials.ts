/**
 * What the machine is made of, up close.
 *
 * The GLB arrives with flat PBR constants, which is why a zoomed-in flange
 * reads as a cylinder with a bevel. These replace them by name with surfaces
 * that have been handled for a century: scratched nickel, chipped enamel,
 * rubber gone matte, brass that has lost its shine in the recesses.
 *
 * The scratch maps are Poly Haven's `metal_plate`, sampled triplanar because
 * nothing in the model carries UVs, and read back as bump so the scratches
 * catch light without needing tangents.
 */

import {
  bumpMap,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  positionLocal,
  smoothstep,
  texture,
  triplanarTexture,
} from "three/tsl";
import {
  MeshStandardNodeMaterial,
  NoColorSpace,
  RepeatWrapping,
  TextureLoader,
  type Material,
  type Texture,
} from "three/webgpu";

import type { FloatNode } from "../tsl-types";

const ROUGHNESS_MAP = "/textures/metal-rough.jpg";
const BUMP_MAP = "/textures/metal-nor.jpg";

/** Texture repeats per world unit. The parts are a tenth of a unit across, so
 * this is what puts a few scratches on a knob rather than one blurry one. */
const SCRATCH_SCALE = 9;
const SCRATCH_RELIEF = 0.0012;

/** Patches of wear. Fine enough to read as handling, not as camouflage. */
const WEAR_SCALE = 70;
/** Noise above this is worn through; most of the surface stays below it. */
const WEAR_ONSET = 0.42;
const WEAR_FULL = 0.78;

const loadMap = async (url: string): Promise<Texture> => {
  const map = await new TextureLoader().loadAsync(url);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.colorSpace = NoColorSpace;
  return map;
};

/** Slow blotches of wear, 0 untouched → 1 worn through. */
const wearField = (offset: number): FloatNode =>
  smoothstep(
    WEAR_ONSET,
    WEAR_FULL,
    mx_fractal_noise_float(positionLocal.mul(WEAR_SCALE).add(offset), 3, 2, 0.5, 1),
  );

interface SurfaceOptions {
  readonly base: string;
  readonly worn: string;
  readonly roughness: number;
  readonly wornRoughness: number;
  readonly metalness: number;
  readonly wearOffset: number;
  readonly scratchDepth: number;
  readonly scratchMap: Texture;
  readonly bumpSource: Texture;
}

const surface = ({
  base,
  worn,
  roughness,
  wornRoughness,
  metalness,
  wearOffset,
  scratchDepth,
  scratchMap,
  bumpSource,
}: SurfaceOptions): MeshStandardNodeMaterial => {
  const material = new MeshStandardNodeMaterial();

  const wear = wearField(wearOffset);
  const scratches = triplanarTexture(texture(scratchMap), null, null, float(SCRATCH_SCALE)).r;

  material.colorNode = mix(color(base), color(worn), wear);
  // The scratch map darkens roughness where the plate was polished and
  // lightens it where it was dragged across something; wear pulls the whole
  // thing matte.
  material.roughnessNode = mix(float(roughness), float(wornRoughness), wear)
    .add(scratches.sub(0.5).mul(scratchDepth))
    .clamp(0.08, 1);
  material.metalness = metalness;
  material.normalNode = bumpMap(
    triplanarTexture(texture(bumpSource), null, null, float(SCRATCH_SCALE)).r,
    float(SCRATCH_RELIEF),
  );

  return material;
};

/** Keyed by the material names the Blender script assigns. */
export const createHardwareMaterials = async (): Promise<Map<string, Material>> => {
  const [scratchMap, bumpSource] = await Promise.all([
    loadMap(ROUGHNESS_MAP),
    loadMap(BUMP_MAP),
  ]);

  const nickel = surface({
    base: "#786f63",
    worn: "#5e5750",
    roughness: 0.32,
    wornRoughness: 0.62,
    metalness: 0.9,
    wearOffset: 0,
    scratchDepth: 0.5,
    scratchMap,
    bumpSource,
  });

  const blued = surface({
    base: "#2a2622",
    worn: "#3a332c",
    roughness: 0.3,
    wornRoughness: 0.55,
    metalness: 0.85,
    wearOffset: 17,
    scratchDepth: 0.4,
    scratchMap,
    bumpSource,
  });

  const enamel = surface({
    base: "#0c0a08",
    worn: "#1c1814",
    roughness: 0.22,
    wornRoughness: 0.7,
    metalness: 0.08,
    wearOffset: 41,
    scratchDepth: 0.35,
    scratchMap,
    bumpSource,
  });

  const brass = surface({
    base: "#a8843f",
    worn: "#7d6436",
    roughness: 0.36,
    wornRoughness: 0.6,
    metalness: 1,
    wearOffset: 73,
    scratchDepth: 0.3,
    scratchMap,
    bumpSource,
  });

  // Rubber: no scratches, just a fine tooth and dust in the low spots.
  const rubber = new MeshStandardNodeMaterial();
  const tooth = mx_fractal_noise_float(positionLocal.mul(260), 2, 2, 0.5, 1);
  rubber.colorNode = color("#17130f").add(tooth.mul(0.015));
  rubber.roughnessNode = tooth.mul(0.12).add(0.62);
  rubber.metalness = 0;

  return new Map<string, Material>([
    ["Platen Steel", nickel],
    ["Bail Steel", blued],
    ["Frame Enamel", enamel],
    ["Brass", brass],
    ["Platen Rubber", rubber],
  ]);
};
