// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../serveRushDaemon', () => ({ serveRushDaemonAsync: jest.fn() }));

import * as path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  launchRushDaemonAsync,
  resolveRushDaemonWorkspace,
  type IRushDaemonWorkspace
} from '../RushDaemonCommandLine';
import { serveRushDaemonAsync } from '../serveRushDaemon';
import { RushDaemonRequestResolver } from '../RushDaemonRequestResolver';

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
      '{ "rushVersion": "5.179.0", "daemon": { "idleTimeoutSeconds": 42 } }\n'
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
});
