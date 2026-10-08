/**
 * Everything the typist has written, as meshes on the page.
 *
 * One mesh per line, not one for the whole document: only the line being typed
 * is ever rebuilt, so the cost of a keystroke is the same on line 3 and on
 * line 3000. Lines that travel off the page are let go and never come back.
 */

import type { MSDFFont } from "lettra";
import { Group, Mesh, type Material } from "three/webgpu";

import type { Line, TypewriterState } from "@/core/typewriter-machine";
import { buildLineGeometry } from "./line-geometry";
import { SHEET_DROP, SHEET_RISE, lineBaselineY } from "./sheet-metrics";

export interface TypedDocument {
  readonly group: Group;
  /** Redraws whatever changed since the last call. */
  readonly sync: (state: TypewriterState) => void;
  /** Releases lines that have travelled out of sight. */
  readonly cull: (scrollY: number) => void;
  readonly dispose: () => void;
}

export interface DocumentOptions {
  readonly font: MSDFFont;
  /** Shared by every line, so the whole page is one pipeline. */
  readonly material: Material;
}

export const createDocument = ({
  font,
  material,
}: DocumentOptions): TypedDocument => {
  const group = new Group();
  const meshes = new Map<number, Mesh>();
  const drawn = new Map<number, Line>();
  /** Lines below this have left the page for good. */
  let oldestLive = 0;

  const release = (lineNumber: number): void => {
    const mesh = meshes.get(lineNumber);
    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
      meshes.delete(lineNumber);
    }
    drawn.delete(lineNumber);
  };

  const draw = (lineNumber: number, line: Line): void => {
    const geometry = buildLineGeometry(font, line, lineNumber);
    const existing = meshes.get(lineNumber);

    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      return;
    }

    const mesh = new Mesh(geometry, material);
    // Lines live in document space and are scrolled by the material, so the
    // CPU-side bounds never match where they actually draw.
    mesh.frustumCulled = false;
    meshes.set(lineNumber, mesh);
    group.add(mesh);
  };

  const sync = (state: TypewriterState): void => {
    for (let n = oldestLive; n < state.lines.length; n += 1) {
      const line = state.lines[n];
      if (drawn.get(n) === line) continue;

      drawn.set(n, line);
      if (line.length === 0) release(n);
      else draw(n, line);
    }
  };

  const cull = (scrollY: number): void => {
    for (const lineNumber of [...meshes.keys()]) {
      const y = lineBaselineY(lineNumber) + scrollY;
      if (y <= SHEET_RISE && y >= -SHEET_DROP) continue;

      release(lineNumber);
      // Only lines that went up over the roller are gone for good; anything
      // off the bottom is still ahead of the carriage.
      if (y > SHEET_RISE && lineNumber >= oldestLive) {
        oldestLive = lineNumber + 1;
      }
    }
  };

  const dispose = (): void => {
    for (const lineNumber of [...meshes.keys()]) release(lineNumber);
  };

  return { group, sync, cull, dispose };
};
