// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../serveRushDaemon', () => ({ serveRushDaemonAsync: jest.fn() }));

import * as path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { Rush } from '@microsoft/rush-lib';

import {
  ignoreClosedReader,
  launchRushDaemonAsync,
  resolveRushDaemonWorkspace,
  type IRushDaemonWorkspace
} from '../RushDaemonCommandLine';
import { serveRushDaemonAsync, type IRushDaemonServeOptions } from '../serveRushDaemon';
import { RushDaemonRequestResolver } from '../RushDaemonRequestResolver';
import type { RushDaemonHost } from '../RushDaemonHost';

describe(resolveRushDaemonWorkspace.name, () => {
  let tempFolder: string;

  beforeEach(async () => {
    tempFolder = await mkdtemp(path.join(tmpdir(), 'rushd-cli-'));
  });

  afterEach(async () => {
    await rm(tempFolder, { force: true, recursive: true });
  });

  it('finds and reads the nearest rush.json from a nested folder', async () => {
    const nestedFolder: string = path.join(tempFolder, 'apps', 'example');
    await mkdir(nestedFolder, { recursive: true });
    await writeFile(
      path.join(tempFolder, 'rush.json'),
      '{\n  // The selected Rush version\n  "rushVersion": "5.178.0"\n}\n'
    );

    const workspace: IRushDaemonWorkspace = resolveRushDaemonWorkspace(nestedFolder);

    expect(workspace).toEqual({
      repoRoot: tempFolder,
      rushVersion: '5.178.0'
    });
  });

  it('rejects a rush.json without a string rushVersion', async () => {
    await writeFile(path.join(tempFolder, 'rush.json'), '{ "rushVersion": 5 }\n');

    expect(() => resolveRushDaemonWorkspace(tempFolder)).toThrow(
      /The "rushVersion" field .* must be a string/
    );
  });

  it('reports when no rush.json exists', () => {
    expect(() => resolveRushDaemonWorkspace(tempFolder)).toThrow(/Unable to find rush\.json/);
  });

  it('forwards validated idle configuration to the WS3 host option', async () => {
    await writeFile(
      path.join(tempFolder, 'rush.json'),
      JSON.stringify({ rushVersion: Rush.version, daemon: { idleTimeoutSeconds: 42 } })
    );
    await launchRushDaemonAsync(tempFolder);
    expect(serveRushDaemonAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        repoRoot: tempFolder,
        idleTimeoutSeconds: 42,
        requestResolver: expect.any(RushDaemonRequestResolver)
      })
    );
  });

  it('writes the time and the process ID on the ready line', async () => {
    await writeFile(path.join(tempFolder, 'rush.json'), JSON.stringify({ rushVersion: Rush.version }));
    await launchRushDaemonAsync(tempFolder);
    const options: IRushDaemonServeOptions = jest.mocked(serveRushDaemonAsync).mock.calls.at(-1)![0];
    const write: jest.SpyInstance = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await options.onReady!({ paths: { socketPath: '/tmp/rushd-test.sock' } } as RushDaemonHost);
      const isoTime: string = '\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z';
      expect(write.mock.calls).toEqual([
        [
          expect.stringMatching(
            new RegExp(`^${isoTime} rushd ready at /tmp/rushd-test\\.sock \\(PID ${process.pid}\\)\\n$`)
          )
        ]
      ]);
    } finally {
      write.mockRestore();
    }
  });
});

describe(ignoreClosedReader.name, () => {
  it('ignores the EPIPE of an output whose reader has gone, and throws any other error', () => {
    const closedReader: NodeJS.ErrnoException = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const otherError: NodeJS.ErrnoException = Object.assign(new Error('write EIO'), { code: 'EIO' });

    expect(() => ignoreClosedReader(closedReader)).not.toThrow();
    expect(() => ignoreClosedReader(otherError)).toThrow(otherError);
  });
});
