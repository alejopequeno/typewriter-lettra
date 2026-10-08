interface MachineLoaderProps {
  /** Share of the loading steps finished, 0 … 1. */
  readonly progress: number;
  /** Everything is in: the loader fades out and leaves the tree to the scene. */
  readonly done: boolean;
}

const toPercent = (progress: number): number =>
  Math.round(Math.min(Math.max(progress, 0), 1) * 100);

/**
 * What the typist sees while the machine is assembled: one label, one thin
 * rule filling left to right like a line being typed, and the count.
 */
export const MachineLoader = ({ progress, done }: MachineLoaderProps) => {
  const percent = toPercent(progress);

  return (
    <div className="machine-loader" data-done={done} aria-hidden={done}>
      <p className="machine-loader__label">Loading the machine</p>
      <div
        className="machine-loader__track"
        role="progressbar"
        aria-label="Loading the machine"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span
          className="machine-loader__fill"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      <p className="machine-loader__count">{String(percent).padStart(3, "0")}</p>
    </div>
  );
};
