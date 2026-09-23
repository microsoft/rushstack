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
    expect(watchedPaths).toEqual(expect.arrayContaining(subspaceConfigFolders));

    await watcher[Symbol.asyncDispose]();
  });

  it('keeps permanent observation, awaits project close and reattaches the removed watcher', async () => {
    const created: Map<string, TestFsWatcher[]> = new Map();
    const project = TEST_RUSH_CONFIGURATION.projects[0];
    const watcher: WorkspaceSessionFileWatcher = new WorkspaceSessionFileWatcher({
      rushConfiguration: TEST_RUSH_CONFIGURATION,
      projectNames: [project.packageName],
      watchFactory: (folder) => {
        const instance: TestFsWatcher = new TestFsWatcher();
        const instances: TestFsWatcher[] = created.get(folder) ?? [];
        instances.push(instance);
        created.set(folder, instances);
        return instance as fs.FSWatcher;
      }
    });
    await watcher.startAsync(() => {});
    const projectWatcher: TestFsWatcher = created.get(project.projectFolder)![0];
    const close = jest.spyOn(projectWatcher, 'close').mockImplementation(() => {});
    const closing: Promise<void> = watcher.unwatchProjectsAsync([project.packageName]);
    expect(watcher.watchedProjectNames.has(project.packageName)).toBe(true);
    expect(() => watcher.watchProjects([project.packageName])).toThrow('still closing');
    projectWatcher.emit('close');
    await closing;
    close.mockRestore();
    expect(watcher.watchedProjectNames.size).toBe(0);
    watcher.watchProjects([project.packageName]);
    expect(created.get(project.projectFolder)).toHaveLength(2);
    expect(created.get(TEST_RUSH_CONFIGURATION.rushJsonFolder)).toHaveLength(1);
    expect(created.get(TEST_RUSH_CONFIGURATION.commonRushConfigFolder)).toHaveLength(1);
    await watcher[Symbol.asyncDispose]();
  });

  it('retains failed watcher accounting, removes temporary listeners, and supports retry', async () => {
    const created: Map<string, TestFsWatcher> = new Map();
    const project = TEST_RUSH_CONFIGURATION.projects[0];
    const watcher: WorkspaceSessionFileWatcher = new WorkspaceSessionFileWatcher({
      rushConfiguration: TEST_RUSH_CONFIGURATION,
      watchFactory: (folder) => {
        const instance: TestFsWatcher = new TestFsWatcher();
        created.set(folder, instance);
        return instance as fs.FSWatcher;
      }
    });
    await watcher.startAsync(() => {});
    const projectWatcher: TestFsWatcher = created.get(project.projectFolder)!;
    const listeners: number = projectWatcher.listenerCount('close');
    const close = jest.spyOn(projectWatcher, 'close').mockImplementation(() => {
      throw new Error('close-failed');
    });
    await expect(watcher.unwatchProjectsAsync([project.packageName])).rejects.toThrow('Failed to close');
    expect(watcher.watchedProjectNames.has(project.packageName)).toBe(true);
    expect(projectWatcher.listenerCount('close')).toBe(listeners);
    close.mockRestore();
    await watcher.unwatchProjectsAsync([project.packageName]);
    expect(watcher.watchedProjectNames.has(project.packageName)).toBe(false);
    await watcher[Symbol.asyncDispose]();
  });
});
