// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationExecutionResult, Operation } from '@microsoft/rush-lib';
import { OperationStatus } from '@microsoft/rush-lib';

import { PhasedIterationDemand } from '../PhasedIterationDemand';

interface ITestRecord {
  enabled: boolean;
  readonly operation: Operation;
  status: OperationStatus;
}

function createRecord(name: string, enabled: boolean = true): ITestRecord {
  return { enabled, operation: { name } as unknown as Operation, status: OperationStatus.Waiting };
}

function asResult(record: ITestRecord): IOperationExecutionResult {
  return record as unknown as IOperationExecutionResult;
}

interface ITestDemand {
  readonly abandonedCount: () => number;
  readonly demand: PhasedIterationDemand;
  readonly schedule: (...records: ReadonlyArray<ITestRecord>) => void;
  readonly setStatus: (record: ITestRecord, status: OperationStatus) => void;
}

function createDemand(): ITestDemand {
  let abandonedCount: number = 0;
  const demand: PhasedIterationDemand = new PhasedIterationDemand(() => abandonedCount++);
  return {
    abandonedCount: () => abandonedCount,
    demand,
    schedule: (...records: ReadonlyArray<ITestRecord>) => demand.onIterationScheduled(records.map(asResult)),
    setStatus: (record: ITestRecord, status: OperationStatus) => {
      record.status = status;
      demand.onOperationStatusChanged(asResult(record));
    }
  };
}

describe(PhasedIterationDemand.name, () => {
  it('is restricted once armed, and a later restriction can add operations that a joining client needs', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const running: ITestRecord = createRecord('running');
    const joining: ITestRecord = createRecord('joining', false);
    running.status = OperationStatus.Executing;
    schedule(needed, running, joining);
    expect(demand.restricted).toBe(false);

    demand.restrictTo([needed.operation]);
    expect(demand.restricted).toBe(true);
    // The client that joins enables its operation, and the batch restricts the demand again
    joining.enabled = true;
    demand.restrictTo([needed.operation, joining.operation]);
    setStatus(needed, OperationStatus.Success);

    expect(joining.enabled).toBe(true);
    expect(abandonedCount()).toBe(0);
    setStatus(joining, OperationStatus.Success);
    expect(abandonedCount()).toBe(1);
  });

  it('never reports an iteration abandoned until it is armed', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const other: ITestRecord = createRecord('other');
    schedule(needed, other);

    setStatus(needed, OperationStatus.Success);

    expect(abandonedCount()).toBe(0);
    expect(demand.abandoned).toBe(false);
    expect(other.enabled).toBe(true);
  });

  it('reports abandonment once, when the needed work finishes before enabled unneeded work', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const running: ITestRecord = createRecord('running');
    const waiting: ITestRecord = createRecord('waiting');
    schedule(needed, running, waiting);
    setStatus(running, OperationStatus.Executing);
    demand.restrictTo([needed.operation]);
    setStatus(needed, OperationStatus.Executing);
    expect(abandonedCount()).toBe(0);
    expect([running.enabled, waiting.enabled]).toEqual([true, false]);

    setStatus(needed, OperationStatus.Success);
    expect(abandonedCount()).toBe(1);
    expect(demand.abandoned).toBe(true);

    setStatus(running, OperationStatus.Aborted);
    setStatus(waiting, OperationStatus.Aborted);
    expect(abandonedCount()).toBe(1);
  });

  it('does not report abandonment when unneeded work finishes first', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const other: ITestRecord = createRecord('other');
    schedule(needed, other);
    setStatus(other, OperationStatus.Executing);
    demand.restrictTo([needed.operation]);

    setStatus(other, OperationStatus.Success);
    setStatus(needed, OperationStatus.Success);

    expect(abandonedCount()).toBe(0);
  });

  it('ignores unfinished records that are disabled, since they run nothing', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    schedule(needed, createRecord('disabled', false));
    demand.restrictTo([needed.operation]);

    setStatus(needed, OperationStatus.Success);

    expect(abandonedCount()).toBe(0);
  });

  it('counts only the first terminal status of an iteration record', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const first: ITestRecord = createRecord('first');
    const second: ITestRecord = createRecord('second');
    const unneeded: ITestRecord = createRecord('unneeded');
    schedule(first, second, unneeded);
    setStatus(unneeded, OperationStatus.Executing);
    demand.restrictTo([first.operation, second.operation]);

    setStatus(first, OperationStatus.Success);
    // For example, a failing cache write after the operation succeeded.
    setStatus(first, OperationStatus.Failure);
    // A record outside the iteration, such as a retained result that is invalidated, is ignored.
    demand.onOperationStatusChanged(asResult({ ...second, status: OperationStatus.Success }));
    expect(abandonedCount()).toBe(0);

    setStatus(second, OperationStatus.Blocked);
    expect(abandonedCount()).toBe(1);
  });

  it('reports abandonment at once when it is armed after the needed work finished', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const unneeded: ITestRecord = createRecord('unneeded');
    schedule(needed, unneeded);
    setStatus(needed, OperationStatus.FromCache);
    setStatus(unneeded, OperationStatus.Executing);
    expect(abandonedCount()).toBe(0);

    demand.restrictTo([needed.operation]);

    expect(abandonedCount()).toBe(1);
  });

  it('narrows to the remaining clients when another client leaves', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const small: ITestRecord = createRecord('small');
    const large: ITestRecord = createRecord('large');
    const departed: ITestRecord = createRecord('departed');
    schedule(small, large, departed);
    setStatus(departed, OperationStatus.Executing);
    demand.restrictTo([small.operation, large.operation]);
    setStatus(small, OperationStatus.Success);
    expect(abandonedCount()).toBe(0);
    expect(large.enabled).toBe(true);

    demand.restrictTo([small.operation]);

    expect(large.enabled).toBe(false);
    expect(abandonedCount()).toBe(1);
  });

  it('applies an arming that precedes scheduling, and withholds the unneeded work when it is scheduled', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const unneeded: ITestRecord = createRecord('unneeded');
    unneeded.status = OperationStatus.Ready;
    demand.restrictTo([needed.operation]);

    schedule(needed, unneeded);

    expect([needed.enabled, unneeded.enabled]).toEqual([true, false]);
    setStatus(needed, OperationStatus.Success);
    expect(abandonedCount()).toBe(0);
  });

  it('treats records that are already terminal when the iteration is scheduled as finished', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const alreadyFinished: ITestRecord = createRecord('already-finished');
    alreadyFinished.status = OperationStatus.Success;
    const running: ITestRecord = createRecord('running');
    schedule(needed, alreadyFinished, running);
    setStatus(running, OperationStatus.Executing);
    demand.restrictTo([needed.operation, alreadyFinished.operation]);
    expect(abandonedCount()).toBe(0);

    setStatus(needed, OperationStatus.Success);

    expect(abandonedCount()).toBe(1);
  });

  it('withholds only the unneeded work that the graph has not handed to an execution slot', () => {
    const { demand, schedule, setStatus } = createDemand();
    const neededWaiting: ITestRecord = createRecord('needed-waiting');
    const neededReady: ITestRecord = createRecord('needed-ready');
    const waiting: ITestRecord = createRecord('waiting');
    const ready: ITestRecord = createRecord('ready');
    const queued: ITestRecord = createRecord('queued');
    const executing: ITestRecord = createRecord('executing');
    schedule(neededWaiting, neededReady, waiting, ready, queued, executing);
    setStatus(neededReady, OperationStatus.Ready);
    setStatus(ready, OperationStatus.Ready);
    setStatus(queued, OperationStatus.Queued);
    setStatus(executing, OperationStatus.Executing);

    demand.restrictTo([neededWaiting.operation, neededReady.operation]);

    expect(
      [neededWaiting, neededReady, waiting, ready, queued, executing].map((record) => record.enabled)
    ).toEqual([true, true, false, false, true, true]);
  });

  it('does not report abandonment when all unneeded work was withheld', () => {
    const { abandonedCount, demand, schedule, setStatus } = createDemand();
    const needed: ITestRecord = createRecord('needed');
    const unneeded: ITestRecord = createRecord('unneeded');
    schedule(needed, unneeded);
    setStatus(needed, OperationStatus.Executing);
    demand.restrictTo([needed.operation]);

    setStatus(needed, OperationStatus.Success);

    expect(unneeded.enabled).toBe(false);
    expect(abandonedCount()).toBe(0);
    // The withheld record finishes as skipped when the graph dispatches it.
    setStatus(unneeded, OperationStatus.Skipped);
    expect(abandonedCount()).toBe(0);
  });
});
