// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import { PackageJsonLookup } from '@rushstack/node-core-library';
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

import type { IInstalledDaemonLauncher } from '../DaemonInstallation';
import {
  selectDaemonLauncherAsync,
  getDaemonVersionCacheFolder,
  getSelectedDaemonStartCommand,
  DaemonLauncherUnavailableError,
  type IDaemonLauncherContext,
  type ISelectDaemonLauncherOptions
} from '../VersionSelectedDaemonLauncher';
import { createDaemonTestRuntimeBase } from './DaemonTestRuntimeBase';
import { hideResolvedValueAsync } from './DaemonRequestWireTestUtilities';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

describe('version-selected daemon launcher', () => {
  let repoRoot: string;
  let runtimeBase: string;
  let context: IDaemonLauncherContext;
  let preserveFixture: boolean;

  beforeEach(() => {
    preserveFixture = false;
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-selection-'));
    runtimeBase = createDaemonTestRuntimeBase();
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
        RUSHD_RUNTIME_DIR: runtimeBase,
        XDG_RUNTIME_DIR: runtimeBase,
        TMPDIR: runtimeBase,
        TMP: runtimeBase,
        TEMP: runtimeBase
      }
    };
  });

  afterEach(async () => {
    if (!preserveFixture) {
      await removeTestFolderAsync(repoRoot);
      await removeTestFolderAsync(runtimeBase);
    }
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

  it("starts the daemon without the starting client's request-scoped variables", () => {
    const command = getSelectedDaemonStartCommand(path.join(repoRoot, 'package.json'), {
      ...context,
      environment: {
        HOME: '/home/user',
        RUSH_PARALLELISM: '48',
        COPILOT_AGENT_SESSION_ID: 'session-1',
        RUSHD_TELEMETRY_TAG: 'tag-1',
        CLAUDE_CODE_SESSION_ID: 'claude-session-1',
        CLAUDE_PID: '4242',
        CLAUDE_CODE_MESSAGING_TOKEN: 'token-1',
        TRACEPARENT: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400',
        RUSHD_OUTPUT: 'agent',
        // The first client's session folders may disappear while the daemon lives on.
        TMPDIR: '/tmp/session-1',
        XDG_RUNTIME_DIR: '/run/user/1000',
        CLAUDE_JOB_DIR: '/home/user/.claude/jobs/job-1',
        CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/claude-1000/inbox-1.sock',
        TEMP: '/tmp/temp-1',
        RUSHD_RUNTIME_DIR: '/var/rushd',
        UNSET: undefined
      }
    });
    expect(command.environment).toEqual({
      HOME: '/home/user',
      RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400',
      RUSHD_OUTPUT: 'agent',
      TEMP: '/tmp/temp-1',
      RUSHD_RUNTIME_DIR: '/var/rushd'
    });
    expect(Object.isFrozen(command.environment)).toBe(true);
  });

  it('never relabels the bundled engine as a different requested version', async () => {
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: '5.178.1' }));
    await expect(
      hideResolvedValueAsync(
        selectDaemonLauncherAsync(
          {
            ...context,
            rushVersion: '5.178.1'
          },
          { allowInstall: false }
        )
      )
    ).rejects.toThrow('Cannot launch selected Rush 5.178.1');
  });

  it('requires the requested version to match rush.json before installing anything', async () => {
    await expect(
      hideResolvedValueAsync(
        selectDaemonLauncherAsync({
          ...context,
          rushVersion: '5.178.1'
        })
      )
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
          tmpdir: runtimeBase,
          uid: process.getuid?.()
        },
        computeDaemonWorkspaceKey({
          canonicalRepoRoot: fs.realpathSync.native(repoRoot),
          rushVersion: Rush.version
        })
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
  }, 15000);

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
      await expect(
        hideResolvedValueAsync(selectDaemonLauncherAsync(requested, { allowInstall: false }))
      ).rejects.toMatchObject({
        installation: { rushVersion: '5.178.1', daemonVersion: '0.4.1' }
      });
    },
    240000
  );

  describe('when no cached or published launcher can serve this client', () => {
    const requestedVersion: string = '5.178.1';
    const oldProtocol: { major: number; minor: number } = { major: 0, minor: 2 };
    const dayMs: number = 24 * 60 * 60 * 1000;
    const hourMs: number = 60 * 60 * 1000;
    let registryFolder: string;
    let cacheFolder: string;
    let verdictPath: string;
    let requested: IDaemonLauncherContext;

    interface INpmCall {
      readonly args: string[];
      readonly pid: number;
      readonly env: Record<string, string>;
    }

    interface IVerdictJson {
      schemaVersion: number;
      rushVersion: string;
      client: string;
      checkedAt: string;
      expiresAt: string;
      reason: string;
      installation?: IInstalledDaemonLauncher;
      incompatibleInstallations: { folderName: string; markerIdentity: string; installation: unknown }[];
    }

    function writeFakeDaemon(
      root: string,
      daemonVersion: string,
      protocolVersion: { major: number; minor: number },
      canLaunchRequests: boolean
    ): void {
      const files: Record<string, string> = {
        '@rushstack/rush-daemon/package.json': JSON.stringify({
          name: '@rushstack/rush-daemon',
          version: daemonVersion,
          main: 'index.js',
          bin: { rushd: 'bin/rushd.js' }
        }),
        '@rushstack/rush-daemon/bin/rushd.js': '',
        '@rushstack/rush-daemon/index.js': canLaunchRequests
          ? 'for (const name of ["serveRushDaemonAsync", "ProductionDaemonRequestResolver", "RushDaemonRequestResolver"]) exports[name] = function () {};\n'
          : '',
        '@microsoft/rush-lib/package.json': JSON.stringify({
          name: '@microsoft/rush-lib',
          version: requestedVersion,
          main: 'index.js'
        }),
        // Only an attestation loads this engine, so the log counts attestations.
        '@microsoft/rush-lib/index.js':
          `require('fs').appendFileSync(${JSON.stringify(path.join(registryFolder, 'probes.log'))}, 'probe\\n');\n` +
          `exports.Rush = { version: ${JSON.stringify(requestedVersion)} };\n` +
          (canLaunchRequests ? 'exports.resolveDaemonConfiguration = function () {};\n' : ''),
        '@rushstack/rush-daemon-protocol/package.json': JSON.stringify({
          name: '@rushstack/rush-daemon-protocol',
          version: '0.0.0',
          main: 'index.js'
        }),
        '@rushstack/rush-daemon-protocol/index.js': `exports.DAEMON_PROTOCOL_VERSION = ${JSON.stringify(protocolVersion)};\n`
      };
      for (const [file, content] of Object.entries(files)) {
        const filePath: string = path.join(root, 'node_modules', file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
      }
    }

    function writeCachedDaemon(
      daemonVersion: string,
      protocolVersion: { major: number; minor: number },
      canLaunchRequests: boolean
    ): void {
      const folder: string = path.join(cacheFolder, `daemon-${daemonVersion}`);
      writeFakeDaemon(folder, daemonVersion, protocolVersion, canLaunchRequests);
      fs.writeFileSync(
        path.join(folder, 'last-install.flag'),
        JSON.stringify({ node: process.versions.node, daemonVersion })
      );
    }

    function publish(versions: Record<string, string>): void {
      fs.writeFileSync(
        path.join(registryFolder, 'registry.json'),
        JSON.stringify({
          versions: Object.keys(versions),
          packages: Object.fromEntries(
            Object.entries(versions).map(([version, rushVersion]) => [
              version,
              {
                name: '@rushstack/rush-daemon',
                version,
                dependencies: { '@microsoft/rush-lib': rushVersion },
                bin: { rushd: 'bin/rushd.js' }
              }
            ])
          )
        })
      );
    }

    function setRegistryMode(mode: 'answer' | 'fail' | 'hang'): void {
      fs.writeFileSync(path.join(registryFolder, 'mode.txt'), mode);
    }

    function readNpmCalls(): INpmCall[] {
      const log: string = path.join(registryFolder, 'calls.log');
      return fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .split('\n')
            .filter((line) => line)
            .map((line) => JSON.parse(line))
        : [];
    }

    function countProbes(): number {
      const log: string = path.join(registryFolder, 'probes.log');
      return fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .split('\n')
            .filter((line) => line).length
        : 0;
    }

    function readVerdict(): IVerdictJson {
      return JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    }

    function describeNpmCalls(calls: INpmCall[]): string[] {
      return calls.map((call) => call.args.filter((arg) => !arg.startsWith('--')).join(' '));
    }

    async function selectFailureAsync(
      options?: ISelectDaemonLauncherOptions,
      input: IDaemonLauncherContext = requested
    ): Promise<DaemonLauncherUnavailableError> {
      const failure: unknown = await selectDaemonLauncherAsync(input, options).then(
        () => undefined,
        (error: unknown) => error
      );
      if (!(failure instanceof DaemonLauncherUnavailableError)) {
        throw new Error(`Expected DaemonLauncherUnavailableError, not ${String(failure)}`);
      }
      return failure;
    }

    function expectedRefusal(daemonVersion: string): string {
      return (
        `Cannot launch selected Rush ${requestedVersion}: Daemon ${daemonVersion} attests protocol ` +
        `${oldProtocol.major}.${oldProtocol.minor}; this client requires ` +
        `${DAEMON_PROTOCOL_VERSION.major}.${DAEMON_PROTOCOL_VERSION.minor} and default request-launch APIs. ` +
        'Use native Rush instead.'
      );
    }

    beforeEach(() => {
      registryFolder = path.join(repoRoot, 'registry');
      const binFolder: string = path.join(repoRoot, 'bin');
      fs.mkdirSync(binFolder, { recursive: true });
      fs.mkdirSync(registryFolder, { recursive: true });
      const npmScript: string = path.join(binFolder, 'npm.js');
      fs.writeFileSync(
        npmScript,
        `'use strict';
const fs = require('fs');
const path = require('path');
const registry = process.env.FAKE_NPM_REGISTRY;
const args = process.argv.slice(2);
const env = {};
for (const name of ['INIT_CWD', 'NPM_CONFIG_FAKE', 'RUSH_DAEMON_FAKE', '_RUSH_RECURSIVE_RUSHX_CALL', 'FAKE_PASS']) {
  env[name] = process.env[name];
}
fs.appendFileSync(path.join(registry, 'calls.log'), JSON.stringify({ args, pid: process.pid, env }) + '\\n');
const mode = fs.readFileSync(path.join(registry, 'mode.txt'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(registry, 'registry.json'), 'utf8'));
if (args[0] === 'install') {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies['@rushstack/rush-daemon'];
  fs.cpSync(path.join(registry, 'packages', version), process.cwd(), { recursive: true });
} else if (mode === 'fail') {
  process.stderr.write('npm error code E503\\n');
  process.exitCode = 1;
} else if (mode === 'hang') {
  // Like a registry that drops packets: npm neither answers nor exits.
  fs.writeFileSync(path.join(registry, 'hung.pid'), String(process.pid));
  setTimeout(() => {}, 120000);
} else {
  const at = args[1].lastIndexOf('@');
  process.stdout.write(JSON.stringify(at > 0 ? data.packages[args[1].slice(at + 1)] : data.versions));
}
`
      );
      fs.writeFileSync(
        path.join(binFolder, 'npm'),
        `#!/bin/sh\n"${process.execPath}" "${npmScript}" "$@"\n`,
        { mode: 0o755 }
      );
      fs.writeFileSync(path.join(binFolder, 'npm.cmd'), `@"${process.execPath}" "%~dp0npm.js" %*\r\n`);
      setRegistryMode('answer');
      publish({ '0.4.1': requestedVersion, '0.5.0': '5.179.0' });
      writeFakeDaemon(path.join(registryFolder, 'packages', '0.4.1'), '0.4.1', oldProtocol, false);
      fs.writeFileSync(
        path.join(repoRoot, 'rush.json'),
        JSON.stringify({ rushVersion: requestedVersion, pnpmVersion: '10.27.0', projects: [] })
      );
      requested = {
        ...context,
        rushVersion: requestedVersion,
        environment: {
          ...Object.fromEntries(
            Object.entries(context.environment).filter(([name]) => !/^path$/i.test(name))
          ),
          PATH: [binFolder, process.env.PATH ?? process.env.Path].join(path.delimiter),
          FAKE_NPM_REGISTRY: registryFolder
        }
      };
      cacheFolder = getDaemonVersionCacheFolder(requested.environment);
      verdictPath = path.join(cacheFolder, `unavailable-${requestedVersion}.json`);
    });

    it('records why no launcher is usable, and the next selection neither attests nor asks the registry', async () => {
      const first: DaemonLauncherUnavailableError = await selectFailureAsync();
      expect(first.message).toBe(expectedRefusal('0.4.1'));
      expect(first.installation).toMatchObject({ daemonVersion: '0.4.1', rushVersion: requestedVersion });
      expect(describeNpmCalls(readNpmCalls())).toEqual([
        'view @rushstack/rush-daemon versions',
        'view @rushstack/rush-daemon@0.5.0',
        'view @rushstack/rush-daemon@0.4.1',
        'install'
      ]);
      expect(countProbes()).toBe(1);
      const verdict: IVerdictJson = readVerdict();
      expect(verdict.client).toBe(
        `${PackageJsonLookup.loadOwnPackageJson(__dirname).version} protocol ` +
          `${DAEMON_PROTOCOL_VERSION.major}.${DAEMON_PROTOCOL_VERSION.minor}`
      );
      expect(Date.parse(verdict.expiresAt) - Date.parse(verdict.checkedAt)).toBe(dayMs);
      expect(verdict.incompatibleInstallations.map((record) => record.folderName)).toEqual(['daemon-0.4.1']);

      for (let attempt: number = 0; attempt < 2; attempt++) {
        const again: DaemonLauncherUnavailableError = await selectFailureAsync();
        expect(again.message).toBe(first.message);
        expect(again.installation).toEqual(first.installation);
      }
      expect(readNpmCalls()).toHaveLength(4);
      expect(countProbes()).toBe(1);
      expect(readVerdict()).toEqual(verdict);
    }, 60000);

    it('records that no published release pins the engine', async () => {
      publish({ '0.5.0': '5.179.0' });
      const first: DaemonLauncherUnavailableError = await selectFailureAsync();
      expect(first.message).toBe(
        `Cannot launch selected Rush ${requestedVersion}: No published daemon release pins that exact Rush engine. Use native Rush instead.`
      );
      expect(first.installation).toBeUndefined();
      expect(readNpmCalls()).toHaveLength(2);
      const verdict: IVerdictJson = readVerdict();
      expect(Date.parse(verdict.expiresAt) - Date.parse(verdict.checkedAt)).toBe(dayMs);
      expect(verdict.incompatibleInstallations).toEqual([]);

      expect((await selectFailureAsync()).message).toBe(first.message);
      expect(readNpmCalls()).toHaveLength(2);
    }, 60000);

    it('records no verdict when the installer fails, so the next selection asks the registry again', async () => {
      // The registry lists 0.4.1 but cannot deliver it, so every npm install attempt fails.
      fs.rmSync(path.join(registryFolder, 'packages', '0.4.1'), { recursive: true });
      const lookup: string[] = [
        'view @rushstack/rush-daemon versions',
        'view @rushstack/rush-daemon@0.5.0',
        'view @rushstack/rush-daemon@0.4.1'
      ];
      let callsBefore: number = 0;
      for (let attempt: number = 0; attempt < 2; attempt++) {
        const failure: unknown = await selectDaemonLauncherAsync(requested).then(
          () => undefined,
          (error: unknown) => error
        );
        expect(failure).toBeInstanceOf(Error);
        expect(failure).not.toBeInstanceOf(DaemonLauncherUnavailableError);
        // The installer's own report says why it failed.
        expect((failure as Error).message).toBe(
          'Installing @rushstack/rush-daemon@0.4.1 failed (1): Giving up after 3 attempts\n\nProcess exited with code 1'
        );
        expect(fs.existsSync(verdictPath)).toBe(false);
        // Each selection asks the registry again. The installer decides how many times it tries.
        const calls: string[] = describeNpmCalls(readNpmCalls()).slice(callsBefore);
        expect(calls.slice(0, lookup.length)).toEqual(lookup);
        expect(new Set(calls.slice(lookup.length))).toEqual(new Set(['install']));
        callsBefore += calls.length;
      }
      expect(countProbes()).toBe(0);
    }, 60000);

    it('keeps a failed registry lookup for an hour', async () => {
      setRegistryMode('fail');
      const first: DaemonLauncherUnavailableError = await selectFailureAsync();
      expect(first.message).toBe(
        `Cannot launch selected Rush ${requestedVersion}: Registry lookup for @rushstack/rush-daemon failed: npm error code E503\n Use native Rush instead.`
      );
      const verdict: IVerdictJson = readVerdict();
      expect(Date.parse(verdict.expiresAt) - Date.parse(verdict.checkedAt)).toBe(hourMs);

      setRegistryMode('answer');
      expect((await selectFailureAsync()).message).toBe(first.message);
      expect(readNpmCalls()).toHaveLength(1);
    }, 60000);

    it('ends a registry lookup at its deadline, then keeps that failure for an hour', async () => {
      setRegistryMode('hang');
      const started: number = Date.now();
      const first: DaemonLauncherUnavailableError = await selectFailureAsync({ registryTimeoutMs: 1000 });
      expect(Date.now() - started).toBeLessThan(20000);
      expect(first.message).toBe(
        `Cannot launch selected Rush ${requestedVersion}: Registry lookup for @rushstack/rush-daemon did not finish within 1 s. Use native Rush instead.`
      );
      const npmPid: number = Number(fs.readFileSync(path.join(registryFolder, 'hung.pid'), 'utf8'));
      expect(readNpmCalls().map((call) => call.pid)).toEqual([npmPid]);
      // The lookup ends npm's whole process tree but waits only for the process that it started, the npm shim,
      // so npm itself can still be exiting. Left running, it would hang for two minutes.
      await waitForTestProcessExitAsync(npmPid, 10000);
      const verdict: IVerdictJson = readVerdict();
      expect(Date.parse(verdict.expiresAt) - Date.parse(verdict.checkedAt)).toBe(hourMs);

      expect((await selectFailureAsync({ registryTimeoutMs: 1000 })).message).toBe(first.message);
      expect(readNpmCalls()).toHaveLength(1);
    }, 60000);

    it('reports a missing npm as a failed registry lookup', async () => {
      const emptyFolder: string = path.join(repoRoot, 'empty-bin');
      fs.mkdirSync(emptyFolder);
      const failure: DaemonLauncherUnavailableError = await selectFailureAsync(undefined, {
        ...requested,
        environment: { ...requested.environment, PATH: emptyFolder }
      });
      expect(failure.message).toBe(
        `Cannot launch selected Rush ${requestedVersion}: Registry lookup for @rushstack/rush-daemon failed: The executable file was not found: "npm" Use native Rush instead.`
      );
      expect(Date.parse(readVerdict().expiresAt) - Date.parse(readVerdict().checkedAt)).toBe(hourMs);
    }, 60000);

    it('gives npm the environment that Rush gives its commands', async () => {
      await selectFailureAsync(undefined, {
        ...requested,
        environment: {
          ...requested.environment,
          INIT_CWD: repoRoot,
          NPM_CONFIG_FAKE: 'dropped',
          RUSH_DAEMON_FAKE: 'dropped',
          FAKE_PASS: 'kept'
        }
      });
      const views: INpmCall[] = readNpmCalls().filter((call) => call.args[0] === 'view');
      expect(views).toHaveLength(3);
      for (const call of views) {
        expect(call.env).toEqual({ _RUSH_RECURSIVE_RUSHX_CALL: '1', FAKE_PASS: 'kept' });
      }
    }, 60000);

    it.each<[string, (verdict: IVerdictJson) => IVerdictJson | string]>([
      ['has expired', (verdict) => ({ ...verdict, expiresAt: new Date(Date.now() - 1000).toISOString() })],
      [
        'was reached at a later clock time',
        (verdict) => ({
          ...verdict,
          checkedAt: new Date(Date.now() + hourMs).toISOString(),
          expiresAt: new Date(Date.now() + 2 * hourMs).toISOString()
        })
      ],
      ['belongs to another client', (verdict) => ({ ...verdict, client: `${verdict.client}-other` })],
      ['belongs to another engine', (verdict) => ({ ...verdict, rushVersion: '5.179.0' })],
      ['has another schema', (verdict) => ({ ...verdict, schemaVersion: verdict.schemaVersion + 1 })],
      ['is not JSON', () => '{'],
      ['gives no reason', (verdict) => JSON.stringify({ ...verdict, reason: undefined })],
      [
        'records a malformed attestation',
        (verdict) => ({
          ...verdict,
          incompatibleInstallations: verdict.incompatibleInstallations.map((record) => ({
            ...record,
            installation: {}
          }))
        })
      ],
      [
        'records a launcher that would serve this client',
        (verdict) => ({
          ...verdict,
          incompatibleInstallations: verdict.incompatibleInstallations.map((record) => ({
            ...record,
            installation: {
              ...(record.installation as IInstalledDaemonLauncher),
              protocolVersion: DAEMON_PROTOCOL_VERSION,
              canLaunchRequests: true
            }
          }))
        })
      ]
    ])(
      'checks again when the verdict %s',
      async (name, change) => {
        const first: DaemonLauncherUnavailableError = await selectFailureAsync();
        const changed: IVerdictJson | string = change(readVerdict());
        fs.writeFileSync(verdictPath, typeof changed === 'string' ? changed : JSON.stringify(changed));
        const probes: number = countProbes();

        expect((await selectFailureAsync()).message).toBe(first.message);
        expect(describeNpmCalls(readNpmCalls().slice(4))).toEqual([
          'view @rushstack/rush-daemon versions',
          'view @rushstack/rush-daemon@0.5.0',
          'view @rushstack/rush-daemon@0.4.1'
        ]);
        expect(countProbes()).toBe(probes + 2);
        const rewritten: IVerdictJson = readVerdict();
        expect(Date.parse(rewritten.expiresAt) - Date.parse(rewritten.checkedAt)).toBe(dayMs);
        expect(Date.parse(rewritten.checkedAt)).toBeLessThanOrEqual(Date.now());
      },
      60000
    );

    it.each<[string, () => void, number]>([
      [
        'an installation is reinstalled',
        () => {
          const marker: string = path.join(cacheFolder, 'daemon-0.4.1', 'last-install.flag');
          const content: string = fs.readFileSync(marker, 'utf8');
          fs.rmSync(marker);
          fs.writeFileSync(marker, content);
          fs.utimesSync(marker, new Date(2000, 0, 1), new Date(2000, 0, 1));
        },
        2
      ],
      ['another installation pins the engine', () => writeCachedDaemon('0.4.0', oldProtocol, false), 2],
      [
        'an installation is removed',
        () => fs.rmSync(path.join(cacheFolder, 'daemon-0.4.1'), { recursive: true }),
        1
      ]
    ])(
      'checks again when %s',
      async (name, change, newProbes) => {
        const first: DaemonLauncherUnavailableError = await selectFailureAsync();
        change();
        const probes: number = countProbes();
        expect((await selectFailureAsync()).message).toBe(first.message);
        // A changed installation is attested again rather than trusted from the verdict.
        expect(countProbes()).toBe(probes + newProbes);
        expect(describeNpmCalls(readNpmCalls().slice(4)).slice(0, 3)).toEqual([
          'view @rushstack/rush-daemon versions',
          'view @rushstack/rush-daemon@0.5.0',
          'view @rushstack/rush-daemon@0.4.1'
        ]);
        const callsAfterRecheck: number = readNpmCalls().length;
        expect((await selectFailureAsync()).message).toBe(first.message);
        expect(readNpmCalls()).toHaveLength(callsAfterRecheck);
      },
      60000
    );

    it('still launches a usable installation that appears while a verdict stands', async () => {
      await selectFailureAsync();
      writeCachedDaemon('0.6.0', DAEMON_PROTOCOL_VERSION, true);
      const selected = await selectDaemonLauncherAsync(requested);
      expect(selected).toMatchObject({ daemonVersion: '0.6.0', rushVersion: requestedVersion });
      expect(readNpmCalls()).toHaveLength(4);
    }, 60000);

    it('selects among cached installations as before when it may not install', async () => {
      const first: DaemonLauncherUnavailableError = await selectFailureAsync();
      const probes: number = countProbes();
      const cachedOnly: DaemonLauncherUnavailableError = await selectFailureAsync({ allowInstall: false });
      expect(cachedOnly.message).toBe(first.message);
      expect(cachedOnly.installation).toEqual(first.installation);
      expect(countProbes()).toBe(probes + 1);

      fs.rmSync(cacheFolder, { recursive: true });
      expect((await selectFailureAsync({ allowInstall: false })).message).toBe(
        `Cannot launch selected Rush ${requestedVersion}: No matching installed daemon launcher is available. Use native Rush instead.`
      );
      expect(fs.existsSync(verdictPath)).toBe(false);
      expect(readNpmCalls()).toHaveLength(4);
    }, 60000);

    it('gives the cached outcome, not a verdict, when it may not install', async () => {
      await selectFailureAsync();
      fs.rmSync(verdictPath);
      setRegistryMode('fail');
      const failed: DaemonLauncherUnavailableError = await selectFailureAsync();
      const verdict: IVerdictJson = readVerdict();
      expect(verdict.reason).toBe(failed.reason);
      expect(verdict.incompatibleInstallations.map((record) => record.folderName)).toEqual(['daemon-0.4.1']);
      const probes: number = countProbes();

      const cachedOnly: DaemonLauncherUnavailableError = await selectFailureAsync({ allowInstall: false });
      expect(cachedOnly.message).toBe(expectedRefusal('0.4.1'));
      expect(countProbes()).toBe(probes + 1);
      expect(readNpmCalls()).toHaveLength(5);
      expect(readVerdict()).toEqual(verdict);
    }, 60000);
  });

  it.each(['latest', '../escape', '^5.178.1'])('rejects non-exact Rush specifier %s', async (rushVersion) => {
    await expect(
      hideResolvedValueAsync(selectDaemonLauncherAsync({ ...context, rushVersion }))
    ).rejects.toThrow('exact');
  });
});
