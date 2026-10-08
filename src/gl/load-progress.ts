/**
 * Counts finished loading steps and reports the share done, 0 … 1.
 *
 * Every step weighs the same: the steps are few and their real cost depends
 * on the network and the GPU, so a weighted bar would only pretend to be more
 * accurate than an even one.
 */

export type ProgressListener = (fraction: number) => void;

export type TrackStep = <T>(step: Promise<T>) => Promise<T>;

export const trackProgress = (
  totalSteps: number,
  onProgress: ProgressListener,
): TrackStep => {
  let finished = 0;
  onProgress(0);

  return (step) =>
    step.finally(() => {
      finished += 1;
      onProgress(Math.min(finished / totalSteps, 1));
    });
};
