/**
 * A line the machine types on its own page — a hint, a refusal — in its own
 * face, arriving and leaving through lettra's erosion wipe so it reads as ink
 * taking and losing hold of the paper rather than a caption fading.
 *
 * Every piece of text the typist can see is lettra. The DOM keeps only what
 * has to exist before the scene does.
 */

import type { MSDFFont } from "lettra";
import { createText, wipe } from "lettra/three";
import type { Camera, Object3D, Renderer, Scene, Texture } from "three/webgpu";

import { worldPerLayoutPx } from "./line-geometry";

export interface Sign {
  readonly mesh: Object3D;
  /** Reveals the line; a sign already showing starts over. */
  readonly show: () => void;
  /** Dissolves the line away. */
  readonly hide: () => void;
  /** Advances the wipe by `dt` seconds. */
  readonly update: (dt: number) => void;
  readonly warmup: (renderer: Renderer, camera: Camera, scene: Scene) => Promise<void>;
  readonly dispose: () => void;
}

export interface SignOptions {
  readonly font: MSDFFont;
  readonly map: Texture;
  readonly text: string;
  readonly fill: string;
  /** Relative to the typing size. */
  readonly scale: number;
  readonly align: "left" | "center";
  /** Where the line sits in the machine's space. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Seconds the erosion takes to cross the line. */
  readonly wipeSeconds: number;
  /** Seconds to stay before dissolving; `null` stays until told to hide. */
  readonly holdSeconds: number | null;
  /** Snap instead of dissolving. */
  readonly reducedMotion: boolean;
}

type Phase = "away" | "arriving" | "holding" | "leaving";

export const createSign = ({
  font,
  map,
  text,
  fill,
  scale,
  align,
  position,
  wipeSeconds,
  holdSeconds,
  reducedMotion,
}: SignOptions): Sign => {
  const effect = wipe({ band: 0.3 });
  const handle = createText({
    font,
    map,
    text,
    layout: { align, mode: "nowrap" },
    geometry: {
      scale: worldPerLayoutPx(font) * scale,
      anchor: align === "left" ? "baseline-left" : "ink-center",
    },
    material: { fill, effect },
  });
  handle.mesh.position.set(...position);
  handle.mesh.visible = false;

  let phase: Phase = "away";
  let clock = 0;

  const settle = (): void => {
    const { wipeIn, wipeOut } = handle.uniforms;
    if (phase === "away") {
      handle.mesh.visible = false;
      return;
    }
    handle.mesh.visible = true;
    wipeIn.value = phase === "arriving" ? Math.min(1, clock / wipeSeconds) : 1;
    wipeOut.value = phase === "leaving" ? Math.min(1, clock / wipeSeconds) : 0;
  };

  const enter = (next: Phase): void => {
    phase = next;
    clock = 0;
    if (reducedMotion && next === "arriving") phase = "holding";
    if (reducedMotion && next === "leaving") phase = "away";
    settle();
  };

  return {
    mesh: handle.mesh,
    show: () => enter("arriving"),
    // Idempotent: a key every 150 ms must not restart a 320 ms wipe, or the
    // line snaps back to full and dissolves again on every keystroke.
    hide: () => {
      if (phase === "arriving" || phase === "holding") enter("leaving");
    },
    update: (dt) => {
      if (phase === "away") return;
      clock += dt;

      if (phase === "arriving" && clock >= wipeSeconds) enter("holding");
      else if (phase === "holding" && holdSeconds !== null && clock >= holdSeconds) {
        enter("leaving");
      } else if (phase === "leaving" && clock >= wipeSeconds) enter("away");
      else settle();
    },
    warmup: (renderer, camera, scene) =>
      // lettra's warmup wants its own renderer type; ours is the same object.
      handle.warmup(renderer as Parameters<typeof handle.warmup>[0], camera, scene),
    // The atlas is shared with the ink; a sign does not own it.
    dispose: () => handle.dispose({ map: false }),
  };
};
