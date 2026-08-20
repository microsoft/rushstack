// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IWorkspaceInvalidationWatcher,
  IWorkspaceSessionComponents
} from '../WorkspaceSession';
import { WorkspaceSession } from '../WorkspaceSession';
import type { IWorkspaceInvalidationSnapshot } from '../WorkspaceInvalidationTracker';
import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';
import { TEST_REPO_ROOT } from './TestWorkspaceSession';

class TestInvalidationWatcher implements IWorkspaceInvalidationWatcher {
  private readonly _events: string[];
  private _onInvalidation: ((changedPath?: string) => void) | undefined;

  public constructor(events: string[]) {
    this._events = events;
  }

  public startAsync(onInvalidation: (changedPath?: string) => void): Promise<void> {
    this._events.push('watcher-start');
    this._onInvalidation = onInvalidation;
    return Promise.resolve();
  }

  public invalidate(changedPath?: string): void {
    if (!this._onInvalidation) {
      throw new Error('The test watcher is not running.');
    }
    this._onInvalidation(changedPath);
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this._events.push('watcher-dispose');
    this._onInvalidation = undefined;
    return Promise.resolve();
  }
}

describe(WorkspaceSession.name, () => {
  it('loads stable metadata and retains headless invalidations until acknowledged', async () => {
    const events: string[] = [];
    const watcher: TestInvalidationWatcher = new TestInvalidationWatcher(events);
    let componentFactoryCalls: number = 0;
    const session: WorkspaceSession = await WorkspaceSession.createAsync({
      repoRoot: TEST_REPO_ROOT,
      rushVersion: '5.178.0',
      createComponentsAsync: () => {
        componentFactoryCalls++;
        return Promise.resolve<IWorkspaceSessionComponents>({
          projectWatcher: watcher,
          [Symbol.asyncDispose]: () => {
            events.push('components-dispose');
            return Promise.resolve();
          }
        });
      }
    });

    expect(componentFactoryCalls).toBe(1);
    expect(session.metadata).toMatchObject({
      projectCount: session.rushConfiguration.projects.length,
      repoRoot: session.rushConfiguration.rushJsonFolder,
      rushJsonFile: session.rushConfiguration.rushJsonFile,
      rushVersion: '5.178.0'
    });
    expect(session.metadata.projectNames).toEqual(
      Array.from(session.rushConfiguration.projectsByName.keys()).sort()
    );

    const initialSnapshot: IWorkspaceInvalidationSnapshot = session.invalidations.getSnapshot();
    expect(initialSnapshot).toEqual({
      changedPaths: [],
      hasUnknownChanges: true,
      isWatcherHealthy: true,
      sequence: 1
    });
    session.invalidations.acknowledgeThrough(initialSnapshot.sequence);

    watcher.invalidate('packages/a/src/index.ts');
    const firstSnapshot: IWorkspaceInvalidationSnapshot = session.invalidations.getSnapshot();
    watcher.invalidate('packages/a/src/index.ts');
    watcher.invalidate();
    session.invalidations.acknowledgeThrough(firstSnapshot.sequence);

    expect(session.invalidations.getSnapshot()).toEqual({
      changedPaths: ['packages/a/src/index.ts'],
      hasUnknownChanges: true,
      isWatcherHealthy: true,
      sequence: 4
    });

    await session[Symbol.asyncDispose]();
    expect(events).toEqual(['watcher-start', 'watcher-dispose', 'components-dispose']);
  });

  it('does not allow a watcher error to be acknowledged as clean', async () => {
    const session: WorkspaceSession = await WorkspaceSession.createAsync({
      repoRoot: TEST_REPO_ROOT,
      rushVersion: '5.178.0',
      createComponentsAsync: () =>
        Promise.resolve<IWorkspaceSessionComponents>({
          projectWatcher: new TestInvalidationWatcher([]),
          [Symbol.asyncDispose]: () => Promise.resolve()
        })
    });

    session.invalidations.markWatcherUnhealthy();
    const snapshot: IWorkspaceInvalidationSnapshot = session.invalidations.getSnapshot();
    session.invalidations.acknowledgeThrough(snapshot.sequence);

    expect(session.invalidations.getSnapshot()).toMatchObject({
      hasUnknownChanges: true,
      isWatcherHealthy: false
    });
    await session[Symbol.asyncDispose]();
  });

  it('compacts excessive path changes into an unknown invalidation', () => {
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    for (let index: number = 0; index <= 10_000; index++) {
      invalidations.invalidate(`packages/project-${index}/lib/output.js`);
    }

    const overflowSnapshot: IWorkspaceInvalidationSnapshot = invalidations.getSnapshot();
    expect(overflowSnapshot).toEqual({
      changedPaths: [],
      hasUnknownChanges: true,
      isWatcherHealthy: true,
      sequence: 10_001
    });

    invalidations.invalidate('packages/later-change/src/index.ts');
    invalidations.acknowledgeThrough(overflowSnapshot.sequence);
    expect(invalidations.getSnapshot()).toMatchObject({
      changedPaths: [],
      hasUnknownChanges: true,
      sequence: 10_002
    });
    invalidations.acknowledgeThrough(10_002);
    expect(invalidations.getSnapshot().hasUnknownChanges).toBe(false);
  });

  it('disposes components when watcher startup fails', async () => {
    const events: string[] = [];
    const watcher: IWorkspaceInvalidationWatcher = {
      startAsync: () => Promise.reject(new Error('watcher startup failed')),
      [Symbol.asyncDispose]: () => {
        events.push('watcher-dispose');
        return Promise.resolve();
      }
    };

    await expect(
      WorkspaceSession.createAsync({
        repoRoot: TEST_REPO_ROOT,
        rushVersion: '5.178.0',
        createComponentsAsync: () =>
          Promise.resolve<IWorkspaceSessionComponents>({
            projectWatcher: watcher,
            [Symbol.asyncDispose]: () => {
              events.push('components-dispose');
              return Promise.resolve();
            }
          })
      })
    ).rejects.toThrow('watcher startup failed');
    expect(events).toEqual(['watcher-dispose', 'components-dispose']);
  });

  it('preserves initialization and cleanup failures when watcher startup fails', async () => {
    const watcher: IWorkspaceInvalidationWatcher = {
      startAsync: () => Promise.reject(new Error('watcher startup failed')),
      [Symbol.asyncDispose]: () => Promise.reject(new Error('watcher cleanup failed'))
    };

    let thrownError: unknown;
    try {
      await WorkspaceSession.createAsync({
        repoRoot: TEST_REPO_ROOT,
        rushVersion: '5.178.0',
        createComponentsAsync: () =>
          Promise.resolve<IWorkspaceSessionComponents>({
            projectWatcher: watcher,
            [Symbol.asyncDispose]: () => Promise.reject(new Error('component cleanup failed'))
          })
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(AggregateError);
    expect((thrownError as AggregateError).errors).toEqual([
      new Error('watcher startup failed'),
      new Error('watcher cleanup failed'),
      new Error('component cleanup failed')
    ]);
  });
});
