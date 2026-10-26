// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook } from 'tapable';

import { HeftTaskSession, type IHeftTaskSessionOptions } from '../HeftTaskSession';
import type { IHeftLifecycleToolFinishHookOptions } from '../HeftLifecycleSession';

describe(HeftTaskSession.name, () => {
  it('shares toolFinish with the lifecycle without disposing resources between task runs', async () => {
    const toolFinish = new AsyncParallelHook<IHeftLifecycleToolFinishHookOptions>(['options']);
    const session: HeftTaskSession = new HeftTaskSession({
      internalHeftSession: {
        heftConfiguration: { tempFolderPath: '/project/temp' },
        loggingManager: { requestScopedLogger: jest.fn() },
        parsedCommandLine: {},
        lifecycle: { hooks: { toolFinish } }
      },
      phase: { phaseName: 'build' },
      task: { taskName: 'typescript' }
    } as unknown as IHeftTaskSessionOptions);
    const dispose = jest.fn().mockResolvedValue(undefined);
    session.hooks.toolFinish.tapPromise('test', dispose);
    expect(session.hooks.toolFinish).toBe(toolFinish);
    await session.hooks.run.promise({} as never);
    await session.hooks.runIncremental.promise({} as never);
    expect(dispose).not.toHaveBeenCalled();
    await toolFinish.promise({});
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
