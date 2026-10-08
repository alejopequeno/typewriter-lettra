/**
 * The scene: renderer, camera, light, and the three things that make up the
 * picture — the sheet, the roller, and the ink on the page.
 *
 * Owns no typewriter rules. Hand it a state, it draws that state.
 */

import { loadFont, loadFontTexture } from "lettra/three";
import { uniform } from "three/tsl";
import {
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SpotLight,
  Vector3,
  PCFSoftShadowMap,
  WebGPURenderer,
} from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import { carriageColumn, type TypewriterState } from "@/core/typewriter-machine";
import { createDocument, type TypedDocument } from "./document";
import { createInkMaterial } from "./materials/ink-material";
import { createPaperMaterial } from "./materials/paper-material";
import { createPost } from "./post";
import { loadRoller, type Roller } from "./roller";
import { createBackdrop } from "./backdrop";
import {
  CURL_TANGENT_Y,
  INCH,
  SHEET_DROP,
  SHEET_RISE,
  PRINT_LINE_DROP,
  SHEET_WIDTH,
  scrollForLine,
} from "./sheet-metrics";

const FONT_JSON = "/fonts/courier-400.json";
const FONT_ATLAS = "/fonts/courier-400.png";
const ENVIRONMENT = "/hdri/studio.hdr";

/** Enough rows that the bend over the platen reads as a curve, not a fan. */
const SHEET_SEGMENTS_Y = 220;
const SHEET_SEGMENTS_X = 8;

const FIELD_OF_VIEW = 30;
/** The point on the page the camera holds in the middle of the frame. Chosen
 * so the print line — where the carriage always is — sits in the upper third,
 * with the page falling away below it. */
const FRAMING_CENTRE_Y = CURL_TANGENT_Y - 2.6 * INCH;
/** Page width kept in frame, so the margins always have room to breathe. */
const FRAMED_WIDTH = SHEET_WIDTH * 1.46;
const FRAMED_HEIGHT = 6.1 * INCH;

/** The lamp is set so the page lands just under white on its own, which keeps
 * the ink at the near-zero albedo it actually has. Grading down a scene that
 * is lit ten times too bright does the opposite: it lifts the ink to brown. */
const EXPOSURE = 1;

/** How far the machine leans back, in radians. A page in a typewriter is never
 * a plane square to the viewer, and neither is a photograph of one. */
const MACHINE_TILT = 0.2;
/** How far the camera stands left of centre, in world units. Enough that the
 * frame stops reading as a technical elevation, little enough that the
 * right-hand margin does not compress. */
const CAMERA_OFFSET_X = -0.17;

/** How far the camera drifts with the pointer, in world units at full
 * deflection. A lean of the head, not a dolly: enough that the platen and the
 * scale shift against the page, little enough that the text stays readable. */
const PARALLAX_X = 0.07;
const PARALLAX_Y = 0.035;
/** The lean lags the pointer; a camera that snaps to the hand feels like a
 * cursor, one that drifts after it feels like weight. */
const PARALLAX_STIFFNESS = 5;

/** How quickly the platen catches up to a new line. Lower is heavier. */
const SCROLL_STIFFNESS = 14;
const MAX_FRAME_SECONDS = 1 / 20;

export interface Stage {
  readonly sync: (state: TypewriterState) => void;
  /** Where the pointer is, each axis -1 … 1 across the viewport. */
  readonly look: (x: number, y: number) => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Distance that fits both the width and the height of the framed area. */
const framingDistance = (aspect: number): number => {
  const halfVertical = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
  const forHeight = FRAMED_HEIGHT / 2 / halfVertical;
  const forWidth = FRAMED_WIDTH / 2 / (halfVertical * aspect);
  return Math.max(forHeight, forWidth);
};

const loadEnvironment = async (scene: Scene): Promise<void> => {
  const texture = await new RGBELoader().loadAsync(ENVIRONMENT);
  texture.mapping = EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.environmentIntensity = 0.35;
};

export const createStage = async (
  canvas: HTMLCanvasElement,
): Promise<Stage> => {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  await renderer.init();

  const scene = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 50);

  // Sheet, ink and hardware all hang off this, so the lean applies to the
  // machine as a whole and the lamp stays put in the room.
  const machine = new Group();
  machine.rotation.x = MACHINE_TILT;
  scene.add(machine);

  const scrollY = uniform(0);

  const [font, atlas] = await Promise.all([
    loadFont(FONT_JSON),
    loadFontTexture(FONT_ATLAS),
  ]);

  const sheet = new Mesh(
    new PlaneGeometry(
      SHEET_WIDTH,
      SHEET_RISE + SHEET_DROP,
      SHEET_SEGMENTS_X,
      SHEET_SEGMENTS_Y,
    ),
    createPaperMaterial({ scrollY }),
  );
  // The plane is built centred; shift it so its top edge meets the platen.
  sheet.geometry.translate(0, (SHEET_RISE - SHEET_DROP) / 2, 0);
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  sheet.frustumCulled = false;
  machine.add(sheet);

  scene.add(createBackdrop());

  // The platen is scenery: if it fails to load the machine still types, so it
  // arrives on its own schedule rather than holding up the first frame.
  let roller: Roller | null = null;
  void loadRoller()
    .then((loaded) => {
      roller = loaded;
      machine.add(loaded.group);
    })
    .catch((error: unknown) => console.error("the platen is missing", error));

  const page: TypedDocument = createDocument({
    font,
    material: createInkMaterial({ map: atlas, scrollY }),
  });
  machine.add(page.group);

  // A desk lamp, not a sun: close, narrow and with real inverse-square decay,
  // so the page is brightest where the typist is working and falls away into
  // the dark below.
  const lamp = new SpotLight("#fff6ec", 11, 0, 0.56, 1, 2);
  lamp.position.set(-0.64, 0.46, 0.8);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 0.2;
  lamp.shadow.camera.far = 3.4;
  lamp.shadow.bias = -0.0004;
  lamp.shadow.normalBias = 0.004;
  // A lamp this close throws a soft edge, and the page bounces light back into
  // its own shadow; a hard black bar across the picture would be a lie.
  lamp.shadow.intensity = 0.5;
  lamp.shadow.radius = 4;

  const aim = new Object3D();
  aim.position.set(0, CURL_TANGENT_Y - 1.6 * INCH, 0);
  lamp.target = aim;

  // Just enough from the other side to keep the right-hand margin and the
  // platen from going flat black.
  const fill = new SpotLight("#aebbd4", 2.3, 0, 0.95, 1, 1.5);
  fill.position.set(1.3, 0.75, 1.1);
  fill.target = aim;

  scene.add(aim, lamp, fill);

  let distance = 1;
  const lean = { x: 0, y: 0 };
  const leanTarget = { x: 0, y: 0 };

  const placeCamera = (): void => {
    camera.position.set(
      CAMERA_OFFSET_X + lean.x * PARALLAX_X,
      FRAMING_CENTRE_Y + 0.75 * INCH + lean.y * PARALLAX_Y,
      distance,
    );
    // Looking slightly against the lean makes the page swing the other way,
    // which is what sells it as a head moving rather than the world.
    camera.lookAt(lean.x * -PARALLAX_X * 0.4, FRAMING_CENTRE_Y - lean.y * PARALLAX_Y * 0.4, 0);
  };

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    distance = framingDistance(camera.aspect);
    placeCamera();
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);

    // Hold focus on the line being typed; the curl and the wall fall off it.
    post.focusOn(
      camera.position.distanceTo(
        new Vector3(0, CURL_TANGENT_Y - PRINT_LINE_DROP, 0),
      ),
    );
  };

  const post = createPost({ renderer, scene, camera });

  resize();
  void loadEnvironment(scene);

  let scroll = 0;
  let target = 0;
  let column = 0;
  let previous = performance.now();
  const snap = prefersReducedMotion();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - previous) / 1000, MAX_FRAME_SECONDS);
    previous = now;

    scroll = snap
      ? target
      : scroll + (target - scroll) * (1 - Math.exp(-SCROLL_STIFFNESS * dt));

    scrollY.value = scroll;
    page.cull(scroll);

    if (!snap) {
      const k = 1 - Math.exp(-PARALLAX_STIFFNESS * dt);
      lean.x += (leanTarget.x - lean.x) * k;
      lean.y += (leanTarget.y - lean.y) * k;
      placeCamera();
    }
    roller?.setColumn(column);
    roller?.update(dt);
    post.render();
  });

  const sync = (state: TypewriterState): void => {
    page.sync(state);
    target = scrollForLine(state.lines.length - 1);
    column = carriageColumn(state);
  };

  const dispose = (): void => {
    renderer.setAnimationLoop(null);
    post.dispose();
    page.dispose();
    sheet.geometry.dispose();
    renderer.dispose();
  };

  const look = (x: number, y: number): void => {
    leanTarget.x = Math.max(-1, Math.min(1, x));
    leanTarget.y = Math.max(-1, Math.min(1, y));
  };

  return { sync, look, resize, dispose };
};
