// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import {
  connectOrStartDaemonAsync,
  requestDaemonShutdownAsync,
  type DaemonClient
} from '@rushstack/rush-client-core';
import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  resolveDaemonPaths,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import {
  selectDaemonLauncherAsync,
  getSelectedDaemonStartCommand,
  DaemonLauncherUnavailableError,
  type IDaemonLauncherContext
} from '../VersionSelectedDaemonLauncher';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

describe('version-selected daemon launcher', () => {
  let repoRoot: string;
  let context: IDaemonLauncherContext;
  let preserveFixture: boolean;

  beforeEach(() => {
    preserveFixture = false;
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-selection-'));
    fs.mkdirSync(path.join(repoRoot, 'runtime'));
    fs.writeFileSync(
      path.join(repoRoot, 'rush.json'),
      JSON.stringify({
        rushVersion: Rush.version,
        pnpmVersion: '10.27.0',
        projects: []
      })
    );
    context = {
      repoRoot,
      rushVersion: Rush.version,
      environment: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !/^npm_config_(cache|registry|userconfig)$/i.test(name)
          )
        ),
        RUSH_GLOBAL_FOLDER: path.join(repoRoot, 'global'),
        RUSH_PREVIEW_VERSION: undefined,
        NPM_CONFIG_CACHE: path.join(repoRoot, 'npm-cache'),
        XDG_RUNTIME_DIR: path.join(repoRoot, 'runtime'),
        TMPDIR: path.join(repoRoot, 'runtime'),
        TMP: path.join(repoRoot, 'runtime'),
        TEMP: path.join(repoRoot, 'runtime')
      }
    };
  });

  afterEach(async () => {
    if (!preserveFixture) await removeTestFolderAsync(repoRoot);
  });

  async function stopDaemonAsync(client: DaemonClient, paths: IDaemonPaths): Promise<void> {
    try {
      const owner = await requestDaemonShutdownAsync(client, paths).finally(() => client.closeAsync());
      await waitForTestProcessExitAsync(owner.pid);
    } catch (error) {
      preserveFixture = true;
      throw error;
    }
  }

  it('attests the actual bundled engine and protocol without changing the caller environment', async () => {
    const originalRushLibPath: string | undefined = process.env._RUSH_LIB_PATH;
    const selected = await selectDaemonLauncherAsync(context, { allowInstall: false });
    expect(selected.rushVersion).toBe(Rush.version);
    expect(selected.protocolVersion).toEqual(DAEMON_PROTOCOL_VERSION);
    expect(fs.realpathSync.native(selected.rushLibEntryPoint)).toBe(
      fs.realpathSync.native(require.resolve('@microsoft/rush-lib'))
    );
    expect(selected.startCommand.command).toBe(process.execPath);
    expect(process.env._RUSH_LIB_PATH).toBe(originalRushLibPath);
  });

  it('never relabels the bundled engine as a different requested version', async () => {
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: '5.178.1' }));
    await expect(
      selectDaemonLauncherAsync(
        {
          ...context,
          rushVersion: '5.178.1'
        },
        { allowInstall: false }
      )
    ).rejects.toThrow('Cannot launch selected Rush 5.178.1');
  });

  it('requires the requested version to match rush.json before installing anything', async () => {
    await expect(
      selectDaemonLauncherAsync({
        ...context,
        rushVersion: '5.178.1'
      })
    ).rejects.toThrow('does not match rush.json');
    expect(fs.existsSync(path.join(repoRoot, 'global'))).toBe(false);
  });

  it('honors an explicit native preview selection without rewriting repository or package metadata', async () => {
    const rushJson: string = JSON.stringify({ rushVersion: '5.178.1' });
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), rushJson);
    const selected = await selectDaemonLauncherAsync(
      {
        ...context,
        environment: { ...context.environment, RUSH_PREVIEW_VERSION: Rush.version }
      },
      { allowInstall: false }
    );
    expect(selected.rushVersion).toBe(Rush.version);
    expect(fs.readFileSync(path.join(repoRoot, 'rush.json'), 'utf8')).toBe(rushJson);
  });

  it.each([false, true])(
    'starts the attested engine through its real default APIs (preview: %s)',
    async (preview) => {
      const startupContext: IDaemonLauncherContext = preview
        ? {
            ...context,
            environment: { ...context.environment, RUSH_PREVIEW_VERSION: Rush.version }
          }
        : context;
      if (preview) {
        fs.writeFileSync(
          path.join(repoRoot, 'rush.json'),
          JSON.stringify({
            rushVersion: '5.178.1',
            pnpmVersion: '10.27.0',
            projects: []
          })
        );
      }
      const selected = await selectDaemonLauncherAsync(startupContext, { allowInstall: false });
      const paths: IDaemonPaths = resolveDaemonPaths(
        {
          platform: process.platform,
          env: context.environment,
          tmpdir: path.join(repoRoot, 'runtime'),
          uid: process.getuid?.()
        },
        computeDaemonWorkspaceKey({ canonicalRepoRoot: fs.realpathSync.native(repoRoot), rushVersion: Rush.version })
      );
      const client = await connectOrStartDaemonAsync({
        paths,
        expectedDaemonVersion: selected.daemonVersion,
        startCommand: selected.startCommand
      }).catch((cause: unknown) => {
        preserveFixture = true;
        const logPath: string = `${paths.lockfilePath}.log`;
        const log: string = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '(log not created)';
        throw new Error(`Selected daemon startup failed. Launcher log (${logPath}):\n${log}`, { cause });
      });
      try {
        expect(await client.status).toMatchObject({ daemonVersion: selected.daemonVersion });
        expect(fs.readFileSync(`${paths.lockfilePath}.log`, 'utf8')).toContain(`Rush ${Rush.version}`);
      } finally {
        await stopDaemonAsync(client, paths);
      }
    },
    30000
  );

  it('refuses a wrong requested engine at startup without spoofing installed metadata', async () => {
    const selected = await selectDaemonLauncherAsync(context, { allowInstall: false });
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: '5.178.1' }));
    const command = getSelectedDaemonStartCommand(selected.daemonPackageJsonPath, {
      ...context,
      rushVersion: '5.178.1'
    });
    const result = await Utilities.executeCommandAndCaptureOutputAsync({
      command: command.command,
      args: [...command.args],
      workingDirectory: repoRoot,
      environment: { ...command.environment },
      captureExitCodeAndSignal: true
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`actual engine is ${Rush.version}`);
    expect(result.stdout).not.toContain('rushd ready');
  }, 15000);

  it('rechecks the real engine before binding and refuses a changed repository selection', async () => {
    const selected = await selectDaemonLauncherAsync(context, { allowInstall: false });
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: '5.178.1' }));
    const result = await Utilities.executeCommandAndCaptureOutputAsync({
      command: selected.startCommand.command,
      args: [...selected.startCommand.args],
      workingDirectory: repoRoot,
      environment: { ...selected.startCommand.environment },
      captureExitCodeAndSignal: true
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('does not match rush.json');
    expect(result.stdout).not.toContain('rushd ready');
  });

  (process.env.RUSHD_VERSION_SELECTION_REGISTRY_TEST === '1' ? it : it.skip)(
    'installs the real published 5.178.1 engine and reports its actual daemon compatibility gate',
    async () => {
      fs.mkdirSync(path.join(repoRoot, 'common/config/rush'), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, 'common/config/rush/.npmrc'),
        'registry=https://registry.npmjs.org\naudit=false\nfund=false\n'
      );
      const npmrc: string = path.join(repoRoot, 'user.npmrc');
      fs.writeFileSync(npmrc, '');
      fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: '5.178.1' }));
      const requested: IDaemonLauncherContext = {
        ...context,
        rushVersion: '5.178.1',
        environment: {
          ...context.environment,
          NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org',
          NPM_CONFIG_USERCONFIG: npmrc
        }
      };
      let failure: unknown;
      try {
        await selectDaemonLauncherAsync(requested);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(DaemonLauncherUnavailableError);
      if (!(failure instanceof DaemonLauncherUnavailableError))
        throw new Error('Expected compatibility refusal.');
      expect(failure.installation).toMatchObject({ daemonVersion: '0.4.1', rushVersion: '5.178.1' });
      expect(failure.installation!.rushVersion).not.toBe(Rush.version);
      expect(failure.installation!.protocolVersion.minor).toBeLessThan(DAEMON_PROTOCOL_VERSION.minor);
      expect(failure.installation!.rushLibEntryPoint.startsWith(path.join(repoRoot, 'global'))).toBe(true);
      await expect(selectDaemonLauncherAsync(requested, { allowInstall: false })).rejects.toMatchObject({
        installation: { rushVersion: '5.178.1', daemonVersion: '0.4.1' }
      });
    },
    240000
  );

  it.each(['latest', '../escape', '^5.178.1'])('rejects non-exact Rush specifier %s', async (rushVersion) => {
    await expect(selectDaemonLauncherAsync({ ...context, rushVersion })).rejects.toThrow('exact');
  });
});
