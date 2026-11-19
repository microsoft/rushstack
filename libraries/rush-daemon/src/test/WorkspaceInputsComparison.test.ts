// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IInputsSnapshot, IOperationGraph, Operation } from '@microsoft/rush-lib';

import { WorkspaceEngineRecreationRequiredError } from '../WorkspaceEngineComponentFactory';
import {
  assertCompatibleInputs,
  createInputsCompatibilityCheck,
  getOperationsWithChangedInputs
} from '../WorkspaceInputsComparison';

const PHASE_NAME: string = '_phase:build';

function createOperation(packageName: string): Operation {
  return {
    associatedPhase: { name: PHASE_NAME },
    associatedProject: { packageName }
  } as unknown as Operation;
}

function createInputsSnapshot(
  hashes: ReadonlyMap<string, string>,
  stateHashByPackageName: Readonly<Record<string, string>> = {}
): IInputsSnapshot {
  return {
    getOperationOwnStateHash: jest.fn((project: unknown, phaseName?: string) => {
      const { packageName } = project as { packageName: string };
      return `${phaseName}:${stateHashByPackageName[packageName]}`;
    }),
    getTrackedFileHashesForOperation: () => hashes,
    hasUncommittedChanges: false,
    hashes,
    rootDirectory: '/repo'
  };
}

// Hashes that report whether they were read
function createObservedHashes(entries: [string, string][]): Map<string, string> {
  const hashes: Map<string, string> = new Map(entries);
  jest.spyOn(hashes, 'keys');
  jest.spyOn(hashes, 'get');
  return hashes;
}

function wereRead(hashes: Map<string, string>): boolean {
  return (hashes.keys as jest.Mock).mock.calls.length > 0 || (hashes.get as jest.Mock).mock.calls.length > 0;
}

const INITIAL_HASHES: [string, string][] = [
  ['common/config/rush/experiments.json', 'experiments'],
  ['a/package.json', 'a-package'],
  ['a/src/index.ts', 'a-index'],
  ['b/src/index.ts', 'b-index']
];

describe(getOperationsWithChangedInputs.name, () => {
  const operationA: Operation = createOperation('a');
  const operationB: Operation = createOperation('b');
  const operationGraph: IOperationGraph = {
    operations: new Set([operationA, operationB])
  } as unknown as IOperationGraph;

  it('returns the operations whose own state hashes differ', () => {
    const hashes: Map<string, string> = new Map(INITIAL_HASHES);
    expect(
      getOperationsWithChangedInputs({
        changedPaths: [],
        currentInputsSnapshot: createInputsSnapshot(hashes, { a: '1', b: '2' }),
        nextInputsSnapshot: createInputsSnapshot(hashes, { a: '1', b: '3' }),
        operationGraph
      })
    ).toEqual([operationB]);
  });

  it('computes no hashes to compare a snapshot with itself', () => {
    const snapshot: IInputsSnapshot = createInputsSnapshot(new Map(INITIAL_HASHES), { a: '1', b: '2' });
    expect(
      getOperationsWithChangedInputs({
        changedPaths: ['a/src/index.ts'],
        currentInputsSnapshot: snapshot,
        nextInputsSnapshot: snapshot,
        operationGraph
      })
    ).toEqual([]);
    expect(snapshot.getOperationOwnStateHash).not.toHaveBeenCalled();
  });
});

describe(assertCompatibleInputs.name, () => {
  it('accepts snapshots that differ only in files that do not define the graph', () => {
    const current: IInputsSnapshot = createInputsSnapshot(new Map(INITIAL_HASHES));
    const next: IInputsSnapshot = createInputsSnapshot(
      new Map([...INITIAL_HASHES, ['a/src/index.ts', 'a-index-2'], ['b/src/new.ts', 'b-new']])
    );
    expect(() => assertCompatibleInputs(current, next)).not.toThrow();
  });

  it.each([
    ['a changed', ['a/package.json', 'a-package-2']],
    ['an added', ['c/package.json', 'c-package']]
  ])('requires a new engine for %s file that may define the graph', (name: string, entry: string[]) => {
    const current: IInputsSnapshot = createInputsSnapshot(new Map(INITIAL_HASHES));
    const next: IInputsSnapshot = createInputsSnapshot(
      new Map([...INITIAL_HASHES, entry as [string, string]])
    );
    expect(() => assertCompatibleInputs(current, next)).toThrow(WorkspaceEngineRecreationRequiredError);
    expect(() => assertCompatibleInputs(next, current)).toThrow(WorkspaceEngineRecreationRequiredError);
  });

  it('reads no hashes of snapshots that share them', () => {
    const hashes: Map<string, string> = createObservedHashes(INITIAL_HASHES);
    assertCompatibleInputs(createInputsSnapshot(hashes), createInputsSnapshot(hashes));
    expect(wereRead(hashes)).toBe(false);
  });
});

describe(createInputsCompatibilityCheck.name, () => {
  it('compares each snapshot with the initial snapshot, unless it was the last compatible one', () => {
    const initialHashes: Map<string, string> = createObservedHashes(INITIAL_HASHES);
    const initialSnapshot: IInputsSnapshot = createInputsSnapshot(initialHashes);
    const checkInputsCompatibility: (snapshot: IInputsSnapshot) => void =
      createInputsCompatibilityCheck(initialSnapshot);

    checkInputsCompatibility(initialSnapshot);
    expect(wereRead(initialHashes)).toBe(false);

    const compatibleHashes: Map<string, string> = createObservedHashes([
      ...INITIAL_HASHES,
      ['a/src/index.ts', 'a-index-2']
    ]);
    const compatibleSnapshot: IInputsSnapshot = createInputsSnapshot(compatibleHashes);
    checkInputsCompatibility(compatibleSnapshot);
    expect(wereRead(compatibleHashes)).toBe(true);

    jest.clearAllMocks();
    checkInputsCompatibility(compatibleSnapshot);
    expect(wereRead(compatibleHashes)).toBe(false);

    const incompatibleSnapshot: IInputsSnapshot = createInputsSnapshot(
      new Map([...INITIAL_HASHES, ['a/package.json', 'a-package-2']])
    );
    expect(() => checkInputsCompatibility(incompatibleSnapshot)).toThrow(
      WorkspaceEngineRecreationRequiredError
    );
    expect(() => checkInputsCompatibility(incompatibleSnapshot)).toThrow(
      WorkspaceEngineRecreationRequiredError
    );

    // Only the last compatible snapshot is skipped
    checkInputsCompatibility(initialSnapshot);
    jest.clearAllMocks();
    checkInputsCompatibility(compatibleSnapshot);
    expect(wereRead(compatibleHashes)).toBe(true);
  });
});
