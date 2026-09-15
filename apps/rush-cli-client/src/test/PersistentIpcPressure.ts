// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IPressureMemorySample {
  readonly budgetBytes: number;
  readonly daemonBytes: number;
  readonly pressureRunnerBytes: number;
  readonly otherRunnerBytes: number;
}

export function getPressureAllocationBytes(sample: IPressureMemorySample): number {
  const { budgetBytes, daemonBytes, pressureRunnerBytes, otherRunnerBytes } = sample;
  if (
    !Object.values(sample).every((value) => Number.isSafeInteger(value) && value >= 0) ||
    budgetBytes === 0 || pressureRunnerBytes === 0 || otherRunnerBytes === 0
  ) {
    throw new Error(`Invalid measured pressure sample: ${JSON.stringify(sample)}`);
  }
  const retainedBytes: number = daemonBytes + pressureRunnerBytes;
  if (retainedBytes >= budgetBytes) {
    throw new Error(`The pressure runner alone cannot fit the budget: ${JSON.stringify(sample)}`);
  }
  // Target the middle of the interval in which both children exceed the budget but one fits.
  return Math.max(0, Math.floor(budgetBytes - retainedBytes - otherRunnerBytes / 2));
}
