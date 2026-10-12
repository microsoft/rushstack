// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { TarExecutable } from '../TarExecutable';

// Archives are created from the base folder, so this folder is never used.
const project: RushConfigurationProject = {
  projectFolder: path.join(os.tmpdir(), 'rush-tar-executable-missing-project')
} as RushConfigurationProject;

describe(TarExecutable.name, () => {
  let tar: TarExecutable;
  let folderPath: string;
  let baseFolderPath: string;

  beforeAll(async () => {
    const found: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(
      new Terminal(new StringBufferTerminalProvider())
    );
    if (!found) {
      throw new Error('"tar" was not found on the PATH');
    }
    tar = found;
  });

  beforeEach(() => {
    folderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-tar-executable-'));
    baseFolderPath = path.join(folderPath, 'base');
    fs.mkdirSync(path.join(baseFolderPath, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(baseFolderPath, 'lib', 'index.js'), 'index');
  });

  afterEach(() => {
    fs.rmSync(folderPath, { recursive: true, force: true });
  });

  it('names the members of an archive from its base folder', async () => {
    const archivePath: string = path.join(folderPath, 'entry.tar.gz');
    const exitCode: number = await tar.tryCreateArchiveFromProjectPathsAsync({
      archivePath,
      paths: ['lib/index.js'],
      project,
      baseFolderPath,
      logFilePath: path.join(folderPath, 'create.log')
    });
    expect(exitCode).toBe(0);

    const outputFolderPath: string = path.join(folderPath, 'output');
    fs.mkdirSync(outputFolderPath);
    expect(
      await tar.tryUntarAsync({
        archivePath,
        outputFolderPath,
        logFilePath: path.join(folderPath, 'untar.log')
      })
    ).toBe(0);
    expect(fs.readdirSync(outputFolderPath)).toEqual(['lib']);
    expect(fs.readFileSync(path.join(outputFolderPath, 'lib', 'index.js'), 'utf8')).toBe('index');
  });

  it('kills tar at once when its signal was aborted before it started', async () => {
    const logFilePath: string = path.join(folderPath, 'create.log');
    const exitCode: number = await tar.tryCreateArchiveFromProjectPathsAsync({
      archivePath: path.join(folderPath, 'entry.tar.gz'),
      paths: ['lib/index.js'],
      project,
      baseFolderPath,
      logFilePath,
      abortSignal: AbortSignal.abort()
    });

    expect(exitCode).toBe(1);
    expect(fs.readFileSync(logFilePath, 'utf8')).toContain('Exited with code "SIGTERM"');
  });

  it('kills tar when its signal aborts while it runs', async () => {
    // A sparse file takes no space, but tar reads 2 GB of zeros from it and gzip compresses them, which takes
    // seconds.
    const fd: number = fs.openSync(path.join(baseFolderPath, 'large.bin'), 'w');
    try {
      fs.ftruncateSync(fd, 2 * 1024 * 1024 * 1024);
    } finally {
      fs.closeSync(fd);
    }
    const logFilePath: string = path.join(folderPath, 'create.log');
    const abortController: AbortController = new AbortController();
    const exitCodePromise: Promise<number> = tar.tryCreateArchiveFromProjectPathsAsync({
      archivePath: path.join(folderPath, 'entry.tar.gz'),
      paths: ['lib/index.js', 'large.bin'],
      project,
      baseFolderPath,
      logFilePath,
      abortSignal: abortController.signal
    });
    await delayAsync(200);
    abortController.abort();
    const abortedAtMs: number = performance.now();

    expect(await exitCodePromise).toBe(1);
    expect(fs.readFileSync(logFilePath, 'utf8')).toContain('Exited with code "SIGTERM"');
    // Unless it was killed, tar would have run for seconds after the abort.
    expect(performance.now() - abortedAtMs).toBeLessThan(1000);
  });
});
