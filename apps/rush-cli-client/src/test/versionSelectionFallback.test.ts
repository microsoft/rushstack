// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush/lib/start', () => ({}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DaemonLauncherUnavailableError } from '@rushstack/rush-daemon/lib/VersionSelectedDaemonLauncher';

import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';

it('uses the native version selector when no compatible foreign daemon launcher exists', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-version-fallback-'));
  const originalArgv: string[] = process.argv;
  const originalEnvironment: NodeJS.ProcessEnv = process.env;
  fs.writeFileSync(path.join(folder, 'rush.json'), JSON.stringify({
    rushVersion: '5.178.1', pnpmVersion: '10.27.0', projects: []
  }));
  const selection = jest.spyOn(connectionOptions, 'getDaemonConnectionOptionsAsync').mockRejectedValue(
    new DaemonLauncherUnavailableError('5.178.1', 'No compatible request-launch APIs.')
  );
  const output = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  jest.spyOn(process, 'cwd').mockReturnValue(folder);
  process.argv = [process.execPath, 'rush-client', 'build', '--to', 'project'];
  process.env = { ...originalEnvironment, CI: 'false', RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy' };
  delete process.env.RUSH_PREVIEW_VERSION;
  try {
    await launchClientAsync(false);
    expect(process.argv[1]).toBe(path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rush'));
    expect(selection).toHaveBeenCalledWith(folder, '5.178.1', expect.objectContaining({ RUSH_DAEMON: '1' }), true);
    expect(Object.isFrozen(selection.mock.calls[0][2])).toBe(true);
    expect(process.argv.slice(2)).toEqual(['build', '--to', 'project']);
    expect(process.env.RUSH_DAEMON).toBeUndefined();
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Using in-process Rush'));
  } finally {
    process.argv = originalArgv;
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true });
  }
});
