// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getPressureAllocationBytes, type IPressureMemorySample } from './PersistentIpcPressure';

describe('measured IPC pressure allocation', () => {
  const original: IPressureMemorySample = {
    budgetBytes: 512 * 1024 * 1024,
    daemonBytes: 118980608,
    pressureRunnerBytes: 74039296,
    otherRunnerBytes: 124960768
  };

  it('sizes the initial allocation from the actual daemon and child samples', () => {
    expect(getPressureAllocationBytes(original)).toBe(281370624);
  });

  it('reestablishes the pressure interval after the captured real daemon working-set drop', () => {
    const afterTrim: IPressureMemorySample = {
      ...original,
      daemonBytes: 15708160,
      pressureRunnerBytes: 356220928
    };
    const beforeAdjustment: number = afterTrim.daemonBytes + afterTrim.pressureRunnerBytes;
    expect(beforeAdjustment + afterTrim.otherRunnerBytes).toBeLessThan(afterTrim.budgetBytes);

    const adjustment: number = getPressureAllocationBytes(afterTrim);
    expect(adjustment).toBe(102461440);
    const retainedBytes: number = beforeAdjustment + adjustment;
    expect(retainedBytes + afterTrim.otherRunnerBytes).toBeGreaterThan(afterTrim.budgetBytes);
    expect(retainedBytes).toBeLessThan(afterTrim.budgetBytes);
  });

  it('does not add memory when the measured allocation already reaches the target', () => {
    expect(getPressureAllocationBytes({
      ...original,
      pressureRunnerBytes: 356220928
    })).toBe(0);
  });

  it('rejects missing measurements and a pressure runner that already exceeds the budget', () => {
    expect(() => getPressureAllocationBytes({ ...original, otherRunnerBytes: 0 })).toThrow(
      'Invalid measured pressure sample'
    );
    expect(() => getPressureAllocationBytes({ ...original, daemonBytes: Number.NaN })).toThrow(
      'Invalid measured pressure sample'
    );
    expect(() => getPressureAllocationBytes({
      ...original,
      pressureRunnerBytes: original.budgetBytes
    })).toThrow('pressure runner alone cannot fit');
  });
});
