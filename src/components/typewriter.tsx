"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createTypewriterAudio,
  type TypewriterAudio,
} from "@/audio/typewriter-audio";
import {
  carriageReturn,
  createState,
  currentLine,
  isPrintable,
  lineToString,
  retreat,
  strike,
  type TypewriterState,
} from "@/core/typewriter-machine";
import type { Stage } from "@/gl/stage";

type Status = "loading" | "ready" | "unsupported";

/** Keys that mean "the browser is doing something else". */
const isShortcut = (event: React.KeyboardEvent): boolean =>
  event.metaKey || event.ctrlKey || event.altKey;

export const Typewriter = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const audioRef = useRef<TypewriterAudio | null>(null);
  const stateRef = useRef<TypewriterState>(createState());

  const [status, setStatus] = useState<Status>("loading");
  const [focused, setFocused] = useState(false);
  const [started, setStarted] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let stage: Stage | null = null;
    let cancelled = false;

    // three/webgpu never reaches the server bundle: it is pulled in here, on
    // the client, at the moment the canvas exists.
    import("@/gl/stage")
      .then(({ createStage }) => createStage(canvas))
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        stage = created;
        stageRef.current = created;
        created.sync(stateRef.current);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        console.error("the machine could not be set up", error);
        if (!cancelled) setStatus("unsupported");
      });

    const onResize = () => stage?.resize();
    addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      removeEventListener("resize", onResize);
      stage?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    },
    [],
  );

  const audio = useCallback((): TypewriterAudio => {
    audioRef.current ??= createTypewriterAudio();
    return audioRef.current;
  }, []);

  /** Keystrokes never re-render: the state goes straight to the GPU, and the
   * textarea is updated in place so assistive tech still sees a real field
   * with a real caret. */
  const commit = useCallback((next: TypewriterState) => {
    stateRef.current = next;
    stageRef.current?.sync(next);

    const keys = keysRef.current;
    if (!keys) return;
    keys.value = lineToString(currentLine(next));
    keys.setSelectionRange(next.column, next.column);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isShortcut(event)) return;

      const state = stateRef.current;
      const machine = audio();
      void machine.resume();

      if (event.key === "Enter") {
        event.preventDefault();
        setAnnouncement(lineToString(currentLine(state)));
        commit(carriageReturn(state));
        machine.carriageReturn();
        setStarted(true);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        commit(retreat(state));
        return;
      }

      if (!isPrintable(event.key)) return;

      event.preventDefault();
      const result = strike(state, event.key);
      if (result.outcome === "jammed") return;

      commit(result.state);
      machine.strike();
      if (result.bell) machine.bell();
      setStarted(true);
    },
    [audio, commit],
  );

  return (
    <div className="typewriter" data-focused={focused}>
      <canvas ref={canvasRef} className="typewriter__canvas" />

      <label className="sr-only" htmlFor="sheet">
        La hoja. Escribí: el carro no vuelve atrás y nada se borra.
      </label>
      <textarea
        id="sheet"
        ref={keysRef}
        className="typewriter__keys"
        autoFocus
        rows={1}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-describedby="sheet-help"
        defaultValue=""
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      <p id="sheet-help" className="sr-only">
        Enter devuelve el carro. Retroceso mueve el carro a la izquierda sin
        borrar, así que la próxima tecla se imprime encima.
      </p>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {status === "ready" && !started && (
        <p className="typewriter__hint" aria-hidden="true">
          empezá a escribir
        </p>
      )}

      {status === "loading" && (
        <p className="typewriter__notice">cargando la máquina…</p>
      )}

      {status === "unsupported" && (
        <p className="typewriter__notice" role="alert">
          Este navegador no puede dibujar la escena. Hace falta WebGPU o WebGL2.
        </p>
      )}
    </div>
  );
};
