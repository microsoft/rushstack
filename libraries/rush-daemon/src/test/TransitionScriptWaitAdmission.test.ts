// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  DaemonRestartReason,
  IDaemonNativeLockHolder,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerErrorCode
} from '../RequestScheduler';
import {
  AdmissionProgress,
  RequestAdmissionController,
  ServedScriptScheduler
} from '../WorkspaceRequestAdmission';

type QueuePosition = IDaemonRequestQueuePositionMessage['payload'];

const RESTART_REASON: DaemonRestartReason = {
  kind: 'workspaceInputsChanged',
  installationFiles: ['common/config/rush/pnpm-lock.yaml']
};
const NATIVE_INSTALL: DaemonRestartReason = { kind: 'nativeMutation', commandName: 'install' };
const HOLDER: IDaemonNativeLockHolder = { pid: 4242, command: 'rush install' };

interface ITestController {
  readonly controller: RequestAdmissionController;
  readonly messages: QueuePosition[];
}

function createController(admission: IDaemonRequestAdmissionOptions | undefined): ITestController {
  const messages: QueuePosition[] = [];
  const controller: RequestAdmissionController = new RequestAdmissionController({
    admission,
    client: {
      abortSignal: new AbortController().signal,
      supportsRequestAdmission: true,
      writeQueuePositionAsync: async (message: IDaemonRequestQueuePositionMessage) => {
        messages.push(message.payload);
      }
    },
    requestId: 'request'
  });
  return { controller, messages };
}

/** A plain queue position, or one that names the process that holds native Rush's repository lock. */
function position(queued: number, nativeLockHolder?: IDaemonNativeLockHolder): QueuePosition {
  return { position: queued, requestId: 'request', ...(nativeLockHolder && { nativeLockHolder }) };
}

/**
 * The position of a request that waits behind a transition whose owner waits for `scriptCount` scripts: the scripts,
 * the owner and the requests queued ahead of it are all ahead of it.
 */
function behind(
  queued: number,
  scriptCount: number,
  restartReason: DaemonRestartReason = RESTART_REASON
): QueuePosition {
  return {
    position: scriptCount + queued,
    requestId: 'request',
    restartReason,
    scriptCount,
    restartsForAnotherRequest: true
  };
}

/** The owner's own position while it waits for `scriptCount` scripts: only the scripts are ahead of it. */
function waitingFor(scriptCount: number, restartReason?: DaemonRestartReason): QueuePosition {
  return {
    position: scriptCount,
    requestId: 'request',
    ...(restartReason && { restartReason }),
    scriptCount
  };
}

interface IOutcome<T> {
  settled: boolean;
  value?: T;
  error?: unknown;
}

function track<T>(promise: Promise<T>): IOutcome<T> {
  const outcome: IOutcome<T> = { settled: false };
  promise.then(
    (value: T) => {
      outcome.settled = true;
      outcome.value = value;
    },
    (error: unknown) => {
      outcome.settled = true;
      outcome.error = error;
    }
  );
  return outcome;
}

describe(`${RequestAdmissionController.name} behind a graph transition that waits for rushx scripts`, () => {
  let scheduler: RequestScheduler;
  let ownerLease: IRequestLease;
  let transition: AdmissionProgress;
  let scripts: ServedScriptScheduler;

  beforeEach(async () => {
    jest.useFakeTimers();
    scheduler = new RequestScheduler();
    ownerLease = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
    transition = new AdmissionProgress();
    scripts = new ServedScriptScheduler();
  });

  afterEach(() => {
    ownerLease.release();
    jest.useRealTimers();
  });

  async function startScriptsAsync(count: number): Promise<IRequestLease[]> {
    const leases: IRequestLease[] = [];
    for (let i: number = 0; i < count; i++) {
      leases.push(await scripts.acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedBuild }));
    }
    return leases;
  }

  function waitBehind(
    follower: ITestController,
    stopWaiting?: AbortSignal
  ): IOutcome<IRequestLease | undefined> {
    const { controller } = follower;
    const admission: Promise<IRequestLease | undefined> = stopWaiting
      ? controller.acquireBehindTransitionAsync(scheduler, transition, false, stopWaiting)
      : controller.acquireBehindTransitionAsync(scheduler, transition);
    return track(admission);
  }

  /**
   * The owner of the transition, which holds the gate, waits for the scripts, as the lifecycle has it do: before a
   * restart for `restartReason`, or, without one, before it runs a native install, which the requests behind it are
   * told of instead.
   */
  function waitForScripts(owner: ITestController, restartReason?: DaemonRestartReason): IOutcome<void> {
    return track(
      owner.controller.waitForServedScriptsAsync(scripts, restartReason, {
        progress: transition,
        restartReason: restartReason ?? NATIVE_INSTALL
      })
    );
  }

  it('tells the requests that wait behind it how many scripts it waits for, and why, until they exit', async () => {
    const [firstScript, secondScript]: IRequestLease[] = await startScriptsAsync(2);
    const owner: ITestController = createController(undefined);
    const first: ITestController = createController({ waitTimeoutMs: 60_000 });
    const second: ITestController = createController(undefined);
    const firstAdmission: IOutcome<IRequestLease | undefined> = waitBehind(first);
    const secondAdmission: IOutcome<IRequestLease | undefined> = waitBehind(second);
    await jest.advanceTimersByTimeAsync(0);
    expect(first.messages).toEqual([position(1), position(1)]);
    expect(second.messages).toEqual([position(2)]);

    const wait: IOutcome<void> = waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(0);
    expect(owner.messages).toEqual([waitingFor(2, RESTART_REASON)]);
    expect(transition.scriptWait).toEqual({ scriptCount: 2, restartReason: RESTART_REASON });
    expect(first.messages.slice(2)).toEqual([behind(1, 2)]);
    expect(second.messages.slice(1)).toEqual([behind(2, 2)]);

    secondScript.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(owner.messages.slice(1)).toEqual([waitingFor(1, RESTART_REASON)]);
    expect(first.messages.slice(3)).toEqual([behind(1, 1)]);
    expect(second.messages.slice(2)).toEqual([behind(2, 1)]);

    firstScript.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(wait).toEqual({ settled: true, value: undefined });
    expect(transition.scriptWait).toBeUndefined();
    // They still wait behind the transition, but no longer for scripts. The owner reports no script count of 0.
    expect(first.messages.slice(4)).toEqual([position(1)]);
    expect(second.messages.slice(3)).toEqual([position(2)]);
    expect(owner.messages).toHaveLength(2);
    expect(firstAdmission.settled || secondAdmission.settled).toBe(false);

    const messageCounts: number[] = [first.messages.length, second.messages.length];
    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(firstAdmission.value?.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
    expect(secondAdmission.value?.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
    expect([first.messages.length, second.messages.length]).toEqual(messageCounts);
    firstAdmission.value?.release();
    secondAdmission.value?.release();
    for (const { controller } of [owner, first, second]) controller.dispose();
  });

  it('names the scripts to a request that starts waiting behind it while it waits for them', async () => {
    const [script]: IRequestLease[] = await startScriptsAsync(1);
    const owner: ITestController = createController(undefined);
    const wait: IOutcome<void> = waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(0);
    const late: ITestController = createController({ waitTimeoutMs: 60_000 });
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(late);
    await jest.advanceTimersByTimeAsync(0);
    expect(late.messages).toEqual([behind(1, 1)]);

    script.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(wait.settled).toBe(true);
    expect(late.messages).toEqual([behind(1, 1), position(1)]);
    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(admission.value).toBeDefined();
    admission.value?.release();
    owner.controller.dispose();
    late.controller.dispose();
  });

  it('tells the requests behind it nothing new when no script runs', async () => {
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 60_000 });
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    await jest.advanceTimersByTimeAsync(0);
    const wait: IOutcome<void> = waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(0);
    expect(wait.settled).toBe(true);
    expect(transition.scriptWait).toBeUndefined();
    expect(owner.messages).toEqual([]);
    expect(follower.messages).toEqual([position(1)]);
    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    admission.value?.release();
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('names the scripts and the restart in the timeout of a request that waits behind it', async () => {
    await startScriptsAsync(1);
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 2000 });
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    // The owner loads the graph first, which does not count against the follower's timeout.
    transition.setActive(true);
    await jest.advanceTimersByTimeAsync(900);
    transition.setActive(false);
    waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(1999);
    expect(admission.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(admission.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 2000ms wait timeout while waiting for another request that waits ' +
        'for 1 rushx script that this daemon runs to exit before it restarts the daemon because ' +
        'common/config/rush/pnpm-lock.yaml changed; 0.9s spent while that request loaded the graph did not count. ' +
        'Use --wait-timeout <seconds> to wait longer.'
    });
    expect(follower.messages).toEqual([position(1), behind(1, 1)]);
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('names the scripts and the native install in the timeout of a request that waits behind it', async () => {
    await startScriptsAsync(2);
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 500 });
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    await jest.advanceTimersByTimeAsync(0);
    // A native install has no restart reason of its own: it runs once the scripts exit, and then restarts the daemon.
    waitForScripts(owner);
    await jest.advanceTimersByTimeAsync(499);
    expect(admission.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(admission.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 500ms wait timeout while waiting for another request that waits ' +
        'for 2 rushx scripts that this daemon runs to exit before it restarts the daemon because it runs rush ' +
        'install. Use --wait-timeout <seconds> to wait longer.'
    });
    expect(owner.messages).toEqual([waitingFor(2)]);
    expect(follower.messages).toEqual([position(1), behind(1, 2, NATIVE_INSTALL)]);
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('does not name the scripts in a later timeout once they have exited', async () => {
    const [script]: IRequestLease[] = await startScriptsAsync(1);
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 2000 });
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    await jest.advanceTimersByTimeAsync(0);
    const wait: IOutcome<void> = waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(1000);
    script.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(wait.settled).toBe(true);
    await jest.advanceTimersByTimeAsync(999);
    expect(admission.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(admission.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        "The request was not admitted within its 2000ms wait timeout while waiting for another request's load " +
        'or reload of the workspace graph. Use --wait-timeout <seconds> to wait longer.'
    });
    expect(follower.messages).toEqual([position(1), behind(1, 1), position(1)]);
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('stops naming the scripts to the requests behind it when it stops waiting for them before they exit', async () => {
    await startScriptsAsync(1);
    const owner: ITestController = createController({ waitTimeoutMs: 500 });
    const follower: ITestController = createController({ waitTimeoutMs: 60_000 });
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    await jest.advanceTimersByTimeAsync(0);
    const wait: IOutcome<void> = waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(499);
    expect(wait.settled).toBe(false);
    expect(follower.messages).toEqual([position(1), behind(1, 1)]);

    await jest.advanceTimersByTimeAsync(1);
    expect(wait.error).toMatchObject({ code: RequestSchedulerErrorCode.WaitTimeout });
    expect(transition.scriptWait).toBeUndefined();
    expect(follower.messages.slice(2)).toEqual([position(1)]);
    // The lifecycle keeps one progress for all of its transitions, so a wait that outlived the owner's would be named
    // to the requests that wait behind the next one.
    const late: ITestController = createController({ waitTimeoutMs: 60_000 });
    const lateAdmission: IOutcome<IRequestLease | undefined> = waitBehind(late);
    await jest.advanceTimersByTimeAsync(0);
    expect(late.messages).toEqual([position(2)]);

    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(admission.value).toBeDefined();
    expect(lateAdmission.value).toBeDefined();
    admission.value?.release();
    lateAdmission.value?.release();
    for (const { controller } of [owner, follower, late]) controller.dispose();
  });

  it('names the scripts rather than a process that holds the lock while both are published', async () => {
    const [script]: IRequestLease[] = await startScriptsAsync(1);
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 60_000 });
    // The lifecycle never publishes both, since the owner waits for the lock only while it reloads.
    transition.setNativeLockHolder(HOLDER);
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    await jest.advanceTimersByTimeAsync(0);
    expect(follower.messages).toEqual([position(1, HOLDER)]);

    const wait: IOutcome<void> = waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(0);
    expect(follower.messages.slice(1)).toEqual([behind(1, 1)]);

    script.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(wait.settled).toBe(true);
    expect(follower.messages.slice(2)).toEqual([position(1, HOLDER)]);
    transition.setNativeLockHolder(undefined);
    await jest.advanceTimersByTimeAsync(0);
    expect(follower.messages.slice(3)).toEqual([position(1)]);
    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(admission.value).toBeDefined();
    admission.value?.release();
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('names the scripts rather than a process that holds the lock in a timeout while both are published', async () => {
    await startScriptsAsync(1);
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 2000 });
    transition.setNativeLockHolder(HOLDER);
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(follower);
    await jest.advanceTimersByTimeAsync(0);
    waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(2000);
    expect(admission.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 2000ms wait timeout while waiting for another request that waits ' +
        'for 1 rushx script that this daemon runs to exit before it restarts the daemon because ' +
        'common/config/rush/pnpm-lock.yaml changed. Use --wait-timeout <seconds> to wait longer.'
    });
    expect(follower.messages).toEqual([position(1, HOLDER), behind(1, 1)]);
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('does not name the scripts to a script that stopped waiting to pass it', async () => {
    await startScriptsAsync(1);
    const owner: ITestController = createController(undefined);
    const passing: ITestController = createController({ waitTimeoutMs: 60_000 });
    const stopWaiting: AbortController = new AbortController();
    const admission: IOutcome<IRequestLease | undefined> = waitBehind(passing, stopWaiting.signal);
    await jest.advanceTimersByTimeAsync(0);
    expect(passing.messages).toEqual([position(1)]);

    stopWaiting.abort();
    waitForScripts(owner, RESTART_REASON);
    await jest.advanceTimersByTimeAsync(0);
    expect(admission).toEqual({ settled: true, value: undefined });
    expect(owner.messages).toEqual([waitingFor(1, RESTART_REASON)]);
    expect(passing.messages).toEqual([position(1)]);
    owner.controller.dispose();
    passing.controller.dispose();
  });
});
