// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';

describe('graph invalidation notifications', () => {
  it('notifies on initialization, paths, unknown changes, acknowledgements and watcher failure', () => {
    const tracker: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    const notify = jest.fn();
    const unsubscribe = tracker.subscribe(notify);
    tracker.invalidateForInitialization();
    tracker.invalidate('a/input.txt');
    tracker.invalidate();
    tracker.acknowledgeThrough(tracker.getSnapshot().sequence);
    tracker.markWatcherUnhealthy();
    expect(notify).toHaveBeenCalledTimes(5);
    expect(tracker.getSnapshot()).toMatchObject({ hasUnknownChanges: true, isWatcherHealthy: false });
    unsubscribe();
    unsubscribe();
    tracker.invalidate('b/input.txt');
    expect(notify).toHaveBeenCalledTimes(5);
  });

  it('isolates a failed observer from invalidation tracking and other subscribers', () => {
    const tracker: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      tracker.subscribe(() => { throw new Error('subscriber failed'); });
      const healthy = jest.fn();
      tracker.subscribe(healthy);
      tracker.invalidate('a/input.txt');
      expect(healthy).toHaveBeenCalledTimes(1);
      expect(tracker.getSnapshot().changedPaths).toEqual(['a/input.txt']);
      expect(warning).toHaveBeenCalledWith(expect.any(Error), { code: 'RUSH_DAEMON_INVALIDATION_CALLBACK_ERROR' });
    } finally {
      warning.mockRestore();
    }
  });
});
