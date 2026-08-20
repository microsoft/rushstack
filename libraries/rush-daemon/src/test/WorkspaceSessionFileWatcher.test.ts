// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';
import { EventEmitter } from 'node:events';

import { WorkspaceSessionFileWatcher } from '../WorkspaceSessionFileWatcher';
import { TEST_RUSH_CONFIGURATION } from './TestWorkspaceSession';

class TestFsWatcher extends EventEmitter {
  public close(): void {
    this.emit('close');
  }

  public ref(): this {
    return this;
  }

  public unref(): this {
    return this;
  }
}

describe(WorkspaceSessionFileWatcher.name, () => {
  it('watches every configured subspace config folder', async () => {
    const watchedPaths: string[] = [];
    const watcher: WorkspaceSessionFileWatcher = new WorkspaceSessionFileWatcher({
      rushConfiguration: TEST_RUSH_CONFIGURATION,
      watchFactory: (folderPath: string) => {
        watchedPaths.push(folderPath);
        return new TestFsWatcher() as fs.FSWatcher;
      }
    });

    await watcher.startAsync(() => {});

    const subspaceConfigFolders: string[] = TEST_RUSH_CONFIGURATION.subspaces.map((subspace) =>
      subspace.getSubspaceConfigFolderPath()
    );
    expect(subspaceConfigFolders.length).toBeGreaterThan(0);
    expect(watchedPaths).toEqual(
      expect.arrayContaining(subspaceConfigFolders)
    );

    await watcher[Symbol.asyncDispose]();
  });
});
