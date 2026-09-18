export const SONAMI = [
  "up",
  "up",
  "down",
  "down",
  "left",
  "right",
  "left",
  "right",
  "b",
  "a",
] as const;
export type SonamiStep = (typeof SONAMI)[number];
export const SONAMI_LENGTH = SONAMI.length;

const KEY_STEPS: Record<string, SonamiStep> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyB: "b",
  KeyA: "a",
};

const PAD_STEPS: { index: number; step: SonamiStep }[] = [
  { index: 12, step: "up" },
  { index: 13, step: "down" },
  { index: 14, step: "left" },
  { index: 15, step: "right" },
  { index: 1, step: "b" },
  { index: 0, step: "a" },
];
const PAD_STEP_INDEX = new Set(PAD_STEPS.map((entry) => entry.index));

export function sonamiStepFromKey(code: string): SonamiStep | null {
  return KEY_STEPS[code] ?? null;
}

export function advanceSonami(index: number, step: SonamiStep | null): number {
  if (index >= 0 && index < SONAMI_LENGTH && step === SONAMI[index])
    return index + 1;
  if (index <= 0) return 0;
  return step === SONAMI[0] ? 1 : 0;
}

export function sonamiStepsFromPad(
  prevButtons: boolean[] | null,
  buttons: boolean[],
): SonamiStep[] {
  const steps: SonamiStep[] = [];
  for (const { index, step } of PAD_STEPS) {
    if (buttons[index] && !prevButtons?.[index]) steps.push(step);
  }
  return steps;
}

export function padSonamiMismatch(
  prevButtons: boolean[] | null,
  buttons: boolean[],
) {
  const limit = Math.max(buttons.length, prevButtons?.length ?? 0, 16);
  for (let index = 0; index < limit; index++) {
    if (PAD_STEP_INDEX.has(index)) continue;
    if (buttons[index] && !prevButtons?.[index]) return true;
  }
  return false;
}
