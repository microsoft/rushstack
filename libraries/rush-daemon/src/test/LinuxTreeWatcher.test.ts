// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

import {
  LinuxTreeWatcher,
  toWatchError,
  type DirectoryWatchFunction,
  type ILinuxTreeWatcherOptions
} from '../LinuxTreeWatcher';

class FakeDirectoryWatcher extends EventEmitter {
  public closed: boolean = false;
  public readonly listener: fs.WatchListener<string>;
  public constructor(listener: fs.WatchListener<string>) {
    super();
    this.listener = listener;
  }
  public close(): void {
    this.closed = true;
  }
  public ref(): this {
    return this;
  }
  public unref(): this {
    return this;
  }
}

interface IHarness {
  readonly root: string;
  readonly events: string[];
  readonly errors: Error[];
  readonly fakes: Map<string, FakeDirectoryWatcher>;
  readonly watcher: LinuxTreeWatcher;
  fire(folder: string, eventType: fs.WatchEventType, filename: string): void;
}

const roots: string[] = [];

function makeTree(files: string[]): string {
  const root: string = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-tree-')));
  roots.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '');
  }
  return root;
}

function createHarness(
  root: string,
  options: Omit<ILinuxTreeWatcherOptions, 'watchDirectory'> = {},
  watchOverride?: (folder: string) => void
): IHarness {
  const events: string[] = [];
  const errors: Error[] = [];
  const fakes: Map<string, FakeDirectoryWatcher> = new Map();
  const watchDirectory: DirectoryWatchFunction = (folder, listener) => {
    watchOverride?.(folder);
    const fake: FakeDirectoryWatcher = new FakeDirectoryWatcher(listener);
    fakes.set(folder, fake);
    return fake as unknown as fs.FSWatcher;
  };
  const watcher: LinuxTreeWatcher = new LinuxTreeWatcher(
    root,
    (eventType, filename) => events.push(`${eventType}:${filename}`),
    { ...options, watchDirectory }
  );
  watcher.on('error', (error: Error) => errors.push(error));
  return {
    root,
    events,
    errors,
    fakes,
    watcher,
    fire: (folder, eventType, filename) => fakes.get(path.join(root, folder))!.listener(eventType, filename)
  };
}

function relativeWatched(harness: IHarness): string[] {
  return [...harness.watcher.watchedFolderPaths].map((folder) => path.relative(harness.root, folder)).sort();
}

async function waitForAsync(condition: () => boolean): Promise<void> {
  for (let attempt: number = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

describe(LinuxTreeWatcher.name, () => {
  it('watches directories only and prunes node_modules, .git, .rush/temp and output folders', async () => {
    const root: string = makeTree([
      'package.json',
      'src/a.ts',
      'src/nested/b.ts',
      'lib/a.js',
      'lib/nested/b.js',
      'node_modules/x/index.js',
      '.git/HEAD',
      '.rush/temp/shrinkwrap.yaml',
      '.rush/other.json',
      'config/rush-project.json'
    ]);
    const harness: IHarness = createHarness(root, {
      getExcludedFolderPathsAsync: async () =>
        new Set([path.join(root, 'lib'), path.join(root, '.rush', 'temp')])
    });
    await harness.watcher.initialWalk;
    expect(relativeWatched(harness)).toEqual(['', '.rush', 'config', 'src', path.join('src', 'nested')]);
    expect(harness.errors).toEqual([]);
    harness.watcher.close();
  });

  it('suppresses events for pruned paths and reports others relative to the root', async () => {
    const root: string = makeTree(['src/a.ts']);
    const harness: IHarness = createHarness(root, {
      getExcludedFolderPathsAsync: async () => new Set([path.join(root, 'lib')])
    });
    await harness.watcher.initialWalk;
    harness.fire('', 'rename', 'lib');
    harness.fire('', 'rename', 'node_modules');
    harness.fire('src', 'change', 'a.ts');
    expect(harness.events).toEqual([`change:${path.join('src', 'a.ts')}`]);
    harness.watcher.close();
  });

  it('follows directories created and removed after the initial walk', async () => {
    const root: string = makeTree(['src/a.ts']);
    const harness: IHarness = createHarness(root);
    await harness.watcher.initialWalk;
    fs.mkdirSync(path.join(root, 'src', 'added', 'deep'), { recursive: true });
    harness.fire('src', 'rename', 'added');
    const added: string = path.join('src', 'added');
    await waitForAsync(() => harness.events.includes(`rename:${added}`) && harness.events.length === 2);
    expect(relativeWatched(harness)).toEqual(['', 'src', added, path.join(added, 'deep')]);

    const deepWatcher: FakeDirectoryWatcher = harness.fakes.get(path.join(root, added, 'deep'))!;
    fs.rmSync(path.join(root, added), { recursive: true });
    harness.fire('src', 'rename', 'added');
    await waitForAsync(() => relativeWatched(harness).length === 2);
    expect(deepWatcher.closed).toBe(true);
    expect(harness.errors).toEqual([]);
    harness.watcher.close();
  });

  it('tolerates directories that disappear during registration without reporting an error', async () => {
    const root: string = makeTree(['a/x.ts', 'b/y.ts']);
    const harness: IHarness = createHarness(root, {}, (folder) => {
      if (path.basename(folder) === 'a') {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      }
    });
    await harness.watcher.initialWalk;
    expect(relativeWatched(harness)).toEqual(['', 'b']);
    harness.fakes.get(path.join(root, 'b'))!.emit('error', Object.assign(new Error('gone'), { code: 'ENOENT' }));
    expect(relativeWatched(harness)).toEqual(['']);
    expect(harness.errors).toEqual([]);
    harness.watcher.close();
  });

  it('reports ENOSPC once with an explicit inotify limit error and stops registering', async () => {
    const root: string = makeTree(['a/x.ts', 'b/y.ts', 'c/z.ts']);
    const harness: IHarness = createHarness(root, {}, (folder) => {
      if (folder !== root) {
        throw Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), {
          code: 'ENOSPC'
        });
      }
    });
    await harness.watcher.initialWalk;
    expect(harness.errors).toHaveLength(1);
    expect((harness.errors[0] as NodeJS.ErrnoException).code).toBe('ENOSPC');
    expect(harness.errors[0].message).toContain('fs.inotify.max_user_watches');
    harness.watcher.close();
  });

  it('throws synchronously when the root cannot be watched, like fs.watch', () => {
    const missing: string = path.join(makeTree([]), 'missing');
    expect(
      () =>
        new LinuxTreeWatcher(missing, () => {}, {
          watchDirectory: (folder) => fs.watch(folder)
        })
    ).toThrow(/ENOENT/);
  });

  it('reports the root after the initial walk when requested and emits close asynchronously', async () => {
    const root: string = makeTree(['src/a.ts']);
    const harness: IHarness = createHarness(root, { reportInitialWalkCompletion: true });
    await harness.watcher.initialWalk;
    expect(harness.events).toEqual(['rename:']);
    const closed: Promise<void> = new Promise((resolve) => harness.watcher.once('close', resolve));
    harness.watcher.close();
    await closed;
    expect([...harness.fakes.values()].every((fake) => fake.closed)).toBe(true);
    expect(harness.watcher.watchedFolderPaths.size).toBe(0);
  });

  it('leaves non-ENOSPC errors unchanged', () => {
    const error: Error = Object.assign(new Error('EMFILE'), { code: 'EMFILE' });
    expect(toWatchError(error, '/x')).toBe(error);
  });

  (process.platform === 'linux' ? it : it.skip)('observes real inotify events in new directories', async () => {
    const root: string = makeTree(['src/a.ts', 'lib/a.js']);
    const events: string[] = [];
    const watcher: LinuxTreeWatcher = new LinuxTreeWatcher(root, (...args) => events.push(args[1]!), {
      getExcludedFolderPathsAsync: async () => new Set([path.join(root, 'lib')])
    });
    try {
      await watcher.initialWalk;
      expect(watcher.watchedFolderPaths.size).toBe(2);
      fs.mkdirSync(path.join(root, 'src', 'new'));
      await waitForAsync(() => watcher.watchedFolderPaths.size === 3);
      fs.writeFileSync(path.join(root, 'src', 'new', 'b.ts'), 'x');
      fs.writeFileSync(path.join(root, 'lib', 'b.js'), 'x');
      await waitForAsync(() => events.includes(path.join('src', 'new', 'b.ts')));
      expect(events.some((event) => event.startsWith('lib'))).toBe(false);
    } finally {
      watcher.close();
    }
  });
});
