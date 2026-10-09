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
import { loadRoller } from "./roller";
import { createBackdrop } from "./backdrop";
import { createSign } from "./sign";
import { createLetterhead } from "./letterhead";
import { createSpring } from "./spring";
import { trackProgress, type ProgressListener } from "./load-progress";
import {
  CURL_TANGENT_Y,
  INK_LIFT,
  LEFT_MARGIN,
  INCH,
  SHEET_DROP,
  SHEET_RISE,
  PRINT_LINE_DROP,
  SCALE_DROP,
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

/** How far the machine leans back, in radians. Just enough that the top of
 * the platen reads as a cylinder; the typist sits square to the machine. */
const MACHINE_TILT = 0.06;
/** The camera sits on the machine's axis. */
const CAMERA_OFFSET_X = 0;

/** How far the camera drifts with the pointer, in world units at full
 * deflection. A lean of the head, not a dolly: enough that the platen and the
 * scale shift against the page, little enough that the text stays readable. */
const PARALLAX_X = 0.07;
const PARALLAX_Y = 0.035;
/** The lean lags the pointer; a camera that snaps to the hand feels like a
 * cursor, one that drifts after it feels like weight. */
const PARALLAX_STIFFNESS = 5;

/** The page flinches when it is struck: pushed into the platen and back.
 * Velocity away from the viewer, in world units per second. */
const RECOIL_VELOCITY = -0.11;
const RECOIL = { stiffness: 2200, damping: 70 };

/** Everything the typist reads is typed by the machine, in its own face.
 * The signs sit above the bowed page by at least the bow's full depth. */
const SIGN_LIFT = INK_LIFT + 0.0045;
const SIGN_INK = "#5a5146";

/** Where the first line will go, until the first key is struck. */
const HINT_TEXT = "start typing";

/** The machine's answer to a key it does not have. Between the scale and
 * the bail: below the bail it sat at the very bottom of a short window, in
 * the darkest band of the vignette, and went unseen. */
const REFUSAL_TEXT = "You can't delete. It's a typewriter.";
const REFUSAL_SCALE = 0.82;
const REFUSAL_DROP = SCALE_DROP + 0.78 * INCH;

/** How quickly the platen catches up to a new line. Lower is heavier. */
const SCROLL_STIFFNESS = 14;
const MAX_FRAME_SECONDS = 1 / 20;

export interface Stage {
  readonly sync: (state: TypewriterState) => void;
  /** A character has just been printed: the guide jabs, the page flinches. */
  readonly strike: () => void;
  /** The typist reached for a key the machine does not have. */
  readonly refuse: () => void;
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

/** Font JSON, font atlas, platen, environment, scene shaders, sign shaders,
 * and the first frames, where the post pipeline builds its own passes. */
const LOADING_STEPS = 7;

/** How long the page fades up once everything is in, in milliseconds. The
 * hint starts typing itself when the fade is done, not under it. Must match
 * the canvas transition in globals.css. */
export const REVEAL_MS = 600;

/** Frames rendered behind the loader before it lifts, so the post pipeline
 * builds its own passes while nobody is looking. */
const HIDDEN_FRAMES = 2;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const loadEnvironment = async (scene: Scene): Promise<void> => {
  const texture = await new RGBELoader().loadAsync(ENVIRONMENT);
  texture.mapping = EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.environmentIntensity = 0.35;
};

export interface StageOptions {
  /** Share of loading finished, 0 … 1, reported as each step lands. */
  readonly onProgress?: ProgressListener;
  /** Aborted when the caller no longer wants the stage. Checked before the
   * stage first draws, so an abandoned stage never touches the canvas while
   * its replacement is drawing there. */
  readonly signal?: AbortSignal;
}

export const createStage = async (
  canvas: HTMLCanvasElement,
  { onProgress = () => {}, signal }: StageOptions = {},
): Promise<Stage> => {
  const track = trackProgress(LOADING_STEPS, onProgress);

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

  // Everything the first frame needs arrives before it: nothing pops in.
  // The platen and the environment are scenery, so a failure there leaves a
  // plainer machine that still types rather than no machine at all.
  const [font, atlas, roller] = await Promise.all([
    track(loadFont(FONT_JSON)),
    track(loadFontTexture(FONT_ATLAS)),
    track(
      loadRoller().catch((error: unknown) => {
        console.error("the platen is missing", error);
        return null;
      }),
    ),
    track(
      loadEnvironment(scene).catch((error: unknown) => {
        console.error("the room light is missing", error);
      }),
    ),
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

  // The sheet and everything printed on it flinch together when struck; the
  // hardware around them does not.
  const paper = new Group();
  paper.add(sheet);
  machine.add(paper);
  const recoil = createSpring(RECOIL);

  scene.add(createBackdrop());

  if (roller) machine.add(roller.group);

  const page: TypedDocument = createDocument({
    font,
    material: createInkMaterial({ map: atlas, scrollY }),
  });
  paper.add(page.group);

  const letterhead = createLetterhead({ scrollY });
  paper.add(letterhead.mesh);

  const snap = prefersReducedMotion();

  const hint = createSign({
    font,
    map: atlas,
    text: HINT_TEXT,
    fill: SIGN_INK,
    scale: 1,
    align: "left",
    // Exactly where the first line will start: column 0, inside the fork,
    // the same cell the first letter lands in.
    position: [LEFT_MARGIN - SHEET_WIDTH / 2, CURL_TANGENT_Y - PRINT_LINE_DROP, SIGN_LIFT],
    // Quick on the way out: the erosion sweeps left to right, the same way
    // the typing comes, so the hint has to be gone before the third letter.
    wipeSeconds: 0.32,
    holdSeconds: null,
    reducedMotion: snap,
  });
  const refusal = createSign({
    font,
    map: atlas,
    text: REFUSAL_TEXT,
    fill: SIGN_INK,
    scale: REFUSAL_SCALE,
    align: "center",
    position: [0, CURL_TANGENT_Y - REFUSAL_DROP, SIGN_LIFT],
    wipeSeconds: 0.55,
    holdSeconds: 2.2,
    reducedMotion: snap,
  });
  machine.add(hint.mesh, refusal.mesh);
  let everStruck = false;

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

  let scroll = 0;
  let target = 0;
  let column = 0;
  let previous = performance.now();

  const frame = (): void => {
    const now = performance.now();
    const dt = Math.min((now - previous) / 1000, MAX_FRAME_SECONDS);
    previous = now;

    scroll = snap
      ? target
      : scroll + (target - scroll) * (1 - Math.exp(-SCROLL_STIFFNESS * dt));

    scrollY.value = scroll;
    page.cull(scroll);
    letterhead.cull(scroll);
    paper.position.z = recoil.update(dt);
    hint.update(dt);
    refusal.update(dt);

    if (!snap) {
      const k = 1 - Math.exp(-PARALLAX_STIFFNESS * dt);
      lean.x += (leanTarget.x - lean.x) * k;
      lean.y += (leanTarget.y - lean.y) * k;
      placeCamera();
    }
    roller?.setColumn(column);
    roller?.setTravel(scroll);
    roller?.update(dt);
    post.render();
  };

  const sync = (state: TypewriterState): void => {
    page.sync(state);
    target = scrollForLine(state.lines.length - 1);
    column = carriageColumn(state);
  };

  let disposed = false;

  const dispose = (): void => {
    disposed = true;
    renderer.setAnimationLoop(null);
    post.dispose();
    page.dispose();
    letterhead.dispose();
    hint.dispose();
    refusal.dispose();
    sheet.geometry.dispose();
    renderer.dispose();
  };

  const strike = (): void => {
    everStruck = true;
    hint.hide();
    roller?.strike();
    recoil.kick(RECOIL_VELOCITY);
  };

  const refuse = (): void => {
    refusal.show();
  };

  // The head moves against the hand: pointer right, camera left, so the
  // machine slides the way the pointer goes.
  const look = (x: number, y: number): void => {
    leanTarget.x = -Math.max(-1, Math.min(1, x));
    leanTarget.y = -Math.max(-1, Math.min(1, y));
  };

  // Every material compiled while the loader is still up, so the first frame
  // the typist sees is the whole machine.
  await Promise.all([
    track(
      Promise.all([
        hint.warmup(renderer, camera, scene),
        refusal.warmup(renderer, camera, scene),
      ]),
    ),
    track(renderer.compileAsync(scene, camera)),
  ]);

  const bailIfAbandoned = (): void => {
    if (!signal?.aborted) return;
    dispose();
    throw signal.reason;
  };

  const renderHiddenFrames = async (): Promise<void> => {
    for (let hidden = 0; hidden < HIDDEN_FRAMES; hidden += 1) {
      bailIfAbandoned();
      frame();
      await nextFrame();
    }
    bailIfAbandoned();
  };
  await track(renderHiddenFrames());
  renderer.setAnimationLoop(frame);

  // The hint types itself once the page has faded up — unless the typist
  // beat it to the first key, in which case it has nothing left to say.
  setTimeout(() => {
    if (!disposed && !everStruck) hint.show();
  }, snap ? 0 : REVEAL_MS);

  return { sync, strike, refuse, look, resize, dispose };
};
