// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';

import { getDaemonConnectionOptions, getDaemonConnectionOptionsAsync } from '../daemonConnectionOptions';

describe('version-selected daemon connection options', () => {
  let repoRoot: string;

  beforeEach(() => {
    const tempRoot: string = path.resolve(__dirname, '../../temp');
    fs.mkdirSync(tempRoot, { recursive: true });
    repoRoot = fs.mkdtempSync(path.join(tempRoot, 'daemon-connection-'));
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: Rush.version }));
  });
  afterEach(() => fs.rmSync(repoRoot, { recursive: true }));

  it('creates an attested async launcher without changing current synchronous callers', async () => {
    const synchronous = getDaemonConnectionOptions(repoRoot, Rush.version, process.env, true);
    const asynchronous = await getDaemonConnectionOptionsAsync(repoRoot, Rush.version, process.env, true);
    expect(asynchronous.paths).toEqual(synchronous.paths);
    expect(asynchronous.expectedDaemonVersion).toBe(synchronous.expectedDaemonVersion);
    expect(asynchronous.startCommand?.args).toEqual(synchronous.startCommand?.args);
  });

  it('does not claim a different requested engine in the synchronous default launcher', () => {
    expect(() => getDaemonConnectionOptions(repoRoot, '5.178.1', {}, true)).toThrow(
      'asynchronous version selection'
    );
  });

  it('does not select or install a launcher for a connect-only invocation', async () => {
    const options = await getDaemonConnectionOptionsAsync(repoRoot, '5.178.1', {}, false);
    expect(options.startCommand).toBeUndefined();
    expect(options.expectedDaemonVersion).toBeUndefined();
  });
});
