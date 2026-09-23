// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { RushDaemonHost } from '../RushDaemonHost';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { createDeferred } from './DaemonRequestWireTestUtilities';
import * as testProcessExit from './TestProcessExit';

describe('daemon graph fixture initialization ownership', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    const pending: (() => Promise<void>) | undefined = cleanup;
    cleanup = undefined;
    await pending?.();
  });

  it('joins and disposes a late real host without publishing the cancelled fixture', async () => {
    const ready = createDeferred<RushDaemonHost>();
    const release = createDeferred<void>();
    const controller: AbortController = new AbortController();
    const startAsync = RushDaemonHost.startAsync;
    const start = jest.spyOn(RushDaemonHost, 'startAsync').mockImplementationOnce(async (options) => {
      const host: RushDaemonHost = await startAsync(options);
      ready.resolve(host);
      await release.promise;
      return host;
    });
    let captured: DaemonGraphTestFixture | undefined;
    let published: DaemonGraphTestFixture | undefined;
    const setup: Promise<void> = DaemonGraphTestFixture.createAsync(
      (created) => {
        captured = created;
      },
      true,
      controller.signal
    ).then((created) => {
      published = created;
    });
    const outcome = Promise.allSettled([setup]);
    let settled: boolean = false;
    const joined = outcome.then((result) => {
      settled = true;
      return result;
    });
    const cleanupAsync = async (): Promise<void> => {
      controller.abort();
      release.resolve();
      try {
        const [result] = await joined;
        if (result.status === 'rejected' && result.reason !== controller.signal.reason) throw result.reason;
      } finally {
        start.mockRestore();
      }
    };
    cleanup = cleanupAsync;
    let closed: boolean = false;
    try {
      const host: RushDaemonHost = await ready.promise;
      void host.closed.then(() => {
        closed = true;
      });
      controller.abort();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(closed).toBe(false);
      expect(fs.existsSync(captured!.folder)).toBe(true);
      expect(published).toBeUndefined();
      release.resolve();
      expect(await joined).toEqual([{ status: 'rejected', reason: controller.signal.reason }]);
      expect(closed).toBe(true);
      expect(fs.existsSync(captured!.folder)).toBe(false);
      expect(fs.existsSync(host.paths.lockfilePath)).toBe(false);
      expect(published).toBeUndefined();
    } finally {
      await cleanupAsync();
    }
  });

  it('cleans partial setup and preserves its original failure', async () => {
    const failure: Error = new Error('injected partial graph fixture setup failure');
    let captured: DaemonGraphTestFixture | undefined;
    await expect(
      DaemonGraphTestFixture.createAsync((created) => {
        captured = created;
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(fs.existsSync(captured!.folder)).toBe(false);
    expect(captured!.host).toBeUndefined();
  });

  it('reports setup and disposal failures together without losing either error', async () => {
    const failure: Error = new Error('injected graph fixture setup failure');
    const cleanupFailure: Error = new Error('injected graph fixture cleanup failure');
    let captured: DaemonGraphTestFixture | undefined;
    const remove = jest.spyOn(testProcessExit, 'removeTestFolderAsync').mockRejectedValueOnce(cleanupFailure);
    try {
      await expect(
        DaemonGraphTestFixture.createAsync((created) => {
          captured = created;
          throw failure;
        })
      ).rejects.toMatchObject({ errors: [failure, cleanupFailure] });
      expect(fs.existsSync(captured!.folder)).toBe(true);
    } finally {
      remove.mockRestore();
      if (captured) await captured[Symbol.asyncDispose]();
    }
  });

  it('cancels before startup without starting a host', async () => {
    const controller: AbortController = new AbortController();
    const start = jest.spyOn(RushDaemonHost, 'startAsync');
    let captured: DaemonGraphTestFixture | undefined;
    try {
      await expect(
        DaemonGraphTestFixture.createAsync(
          (created) => {
            captured = created;
            controller.abort();
          },
          true,
          controller.signal
        )
      ).rejects.toBe(controller.signal.reason);
      expect(start).not.toHaveBeenCalled();
      expect(fs.existsSync(captured!.folder)).toBe(false);
    } finally {
      start.mockRestore();
    }
  });
});
