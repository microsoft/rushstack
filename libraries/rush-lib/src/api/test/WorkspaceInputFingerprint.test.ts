// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  captureWorkspaceInputFingerprintAsync,
  classifyWorkspaceInputChange,
  getWorkspaceFingerprintEnvironmentEntries,
  getWorkspaceHostEnvironment,
  getWorkspaceRequestOperationEnvironment,
  workspaceFingerprintIgnoredEnvironmentVariables,
  workspaceRequestScopedEnvironmentVariables,
  WorkspaceInputChangeTier,
  WorkspaceRuntimeFingerprintCache,
  type IWorkspaceInputFingerprint
} from '../WorkspaceInputFingerprint';
import { RushConfiguration } from '../RushConfiguration';

describe('workspace input fingerprints', () => {
  it('uses ordinal environment ordering independently of insertion order or collation', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const rushJsonPath: string = path.join(folder, 'rush.json');
      fs.writeFileSync(
        rushJsonPath,
        JSON.stringify({ rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] })
      );
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const first: IWorkspaceInputFingerprint = await captureWorkspaceInputFingerprintAsync({
        rushConfiguration,
        runtimeCache,
        environment: { '\u00e9': 'composed', 'e\u0301': 'decomposed' }
      });
      const second: IWorkspaceInputFingerprint = await captureWorkspaceInputFingerprintAsync({
        rushConfiguration,
        runtimeCache,
        environment: { 'e\u0301': 'decomposed', '\u00e9': 'composed' }
      });
      expect(first.environmentHash).toBe(second.environmentHash);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('reloads when a configured plugin shape outside common/config changes', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const write = (relativePath: string, content: string): void => {
        const filename: string = path.join(folder, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
      };
      write('rush.json', JSON.stringify({ rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] }));
      write(
        'common/config/rush/rush-plugins.json',
        JSON.stringify({
          plugins: [{ packageName: '@example/plugin', pluginName: 'example', autoinstallerName: 'plugins' }]
        })
      );
      const store: string = 'common/autoinstallers/plugins/rush-plugins/@example/plugin';
      write('common/autoinstallers/plugins/package.json', '{"name":"plugins","version":"1.0.0"}');
      write(`${store}/rush-plugin-manifest.json`, '{"plugins":[]}');
      write(`${store}/example/command-line.json`, '{"commands":[]}');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(folder, 'rush.json')
      );
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const captureAsync = (): Promise<IWorkspaceInputFingerprint> =>
        captureWorkspaceInputFingerprintAsync({ rushConfiguration, runtimeCache, environment: {} });

      let previous: IWorkspaceInputFingerprint = await captureAsync();
      for (const [relativePath, content] of [
        [`${store}/example/command-line.json`, '{"commands":[],"parameters":[]}'],
        [`${store}/rush-plugin-manifest.json`, '{"plugins":[{}]}'],
        ['common/autoinstallers/plugins/package.json', '{"name":"plugins","version":"1.0.1"}']
      ]) {
        write(relativePath, content);
        const next: IWorkspaceInputFingerprint = await captureAsync();
        expect(classifyWorkspaceInputChange(previous, next)).toBe(WorkspaceInputChangeTier.Reload);
        previous = next;
      }
      fs.rmSync(path.join(folder, `${store}/example/command-line.json`));
      expect(classifyWorkspaceInputChange(previous, await captureAsync())).toBe(
        WorkspaceInputChangeTier.Reload
      );
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('restarts when the implementation of a configured plugin changes, including through a link', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const write = (relativePath: string, content: string): void => {
        const filename: string = path.join(folder, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
      };
      write('rush.json', JSON.stringify({ rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] }));
      write(
        'common/config/rush/rush-plugins.json',
        JSON.stringify({
          plugins: [
            { packageName: '@example/installed', pluginName: 'installed', autoinstallerName: 'plugins' },
            { packageName: '@example/linked', pluginName: 'linked', autoinstallerName: 'plugins' }
          ]
        })
      );
      write('common/autoinstallers/plugins/package.json', '{"name":"plugins","version":"1.0.0"}');
      write('common/autoinstallers/plugins/node_modules/@example/installed/lib/index.js', 'exports.v = 1;');
      // Like a `link:` dependency, whose implementation is checked in outside node_modules.
      write('common/autoinstallers/plugins/linked-plugin/release/index.js', 'exports.v = 1;');
      fs.symlinkSync(
        path.join(folder, 'common/autoinstallers/plugins/linked-plugin'),
        path.join(folder, 'common/autoinstallers/plugins/node_modules/@example/linked'),
        'junction'
      );
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(folder, 'rush.json')
      );
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const captureAsync = (): Promise<IWorkspaceInputFingerprint> =>
        captureWorkspaceInputFingerprintAsync({ rushConfiguration, runtimeCache, environment: {} });

      let previous: IWorkspaceInputFingerprint = await captureAsync();
      expect(classifyWorkspaceInputChange(previous, await captureAsync())).toBe(WorkspaceInputChangeTier.Reuse);
      for (const [relativePath, content] of [
        ['common/autoinstallers/plugins/node_modules/@example/installed/lib/index.js', 'exports.v = 2;'],
        ['common/autoinstallers/plugins/linked-plugin/release/index.js', 'exports.v = 2;'],
        ['common/autoinstallers/plugins/linked-plugin/release/worker.js', 'exports.w = 1;']
      ]) {
        write(relativePath, content);
        const next: IWorkspaceInputFingerprint = await captureAsync();
        expect(classifyWorkspaceInputChange(previous, next)).toBe(WorkspaceInputChangeTier.Restart);
        expect(runtimeCache.changedPaths).toContain(
          path.join(
            folder,
            relativePath.replace('plugins/linked-plugin/', 'plugins/node_modules/@example/linked/')
          )
        );
        previous = next;
      }
      // Files that Node.js never loads as plugin code do not restart the host.
      write('common/autoinstallers/plugins/linked-plugin/README.md', 'Documentation');
      write('common/autoinstallers/plugins/linked-plugin/lib-esm/index.js', 'export const v = 2;');
      write('common/autoinstallers/plugins/linked-plugin/lib-dts/tsdoc-metadata.json', '{}');
      expect(classifyWorkspaceInputChange(previous, await captureAsync())).toBe(WorkspaceInputChangeTier.Reuse);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('reloads when rush.json declares daemon-compatible plugins', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const rushJsonPath: string = path.join(folder, 'rush.json');
      const rushJson: object = { rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] };
      fs.writeFileSync(rushJsonPath, JSON.stringify(rushJson));
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const captureAsync = (): Promise<IWorkspaceInputFingerprint> =>
        captureWorkspaceInputFingerprintAsync({ rushConfiguration, runtimeCache, environment: {} });
      const previous: IWorkspaceInputFingerprint = await captureAsync();
      fs.writeFileSync(
        rushJsonPath,
        JSON.stringify({ ...rushJson, daemon: { compatiblePlugins: ['rush-example-plugin'] } })
      );
      expect(classifyWorkspaceInputChange(previous, await captureAsync())).toBe(
        WorkspaceInputChangeTier.Reload
      );
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('ignores volatile per-shell variables but not engine, Node.js or tool resolution inputs', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const rushJsonPath: string = path.join(folder, 'rush.json');
      fs.writeFileSync(
        rushJsonPath,
        JSON.stringify({ rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [] })
      );
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const base: Record<string, string> = {
        HOME: '/home/user',
        PATH: '/usr/local/bin:/usr/bin',
        PWD: '/repo',
        SHLVL: '1',
        TERM: 'xterm-256color'
      };
      const getHashAsync = async (environment: Record<string, string | undefined>): Promise<string> =>
        (await captureWorkspaceInputFingerprintAsync({ rushConfiguration, runtimeCache, environment }))
          .environmentHash;
      const baseHash: string = await getHashAsync(base);
      for (const volatile of [
        { PWD: '/repo/packages/p03', OLDPWD: '/repo' },
        { SHLVL: '7', _: '/usr/bin/env' },
        { TERM: 'dumb', COLUMNS: '91', LINES: '40', COLORTERM: 'truecolor' },
        { WSL_INTEROP: '/run/WSL/12345_interop', WSLENV: 'WT_SESSION' },
        { SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22', SSH_AUTH_SOCK: '/tmp/agent', TMUX: '/tmp/tmux' },
        { INIT_CWD: '/repo/packages/p03' },
        { RUSH_DAEMON: '1', RUSH_DAEMON_AUTO_START: '0', RUSH_DAEMON_EXPERIMENTAL: '1' },
        { RUSHD_OUTPUT: 'legacy', RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS: '600' },
        { RUSH_PARALLELISM: '48', RUSH_INVOKED_FOLDER: '/repo/packages/p03' },
        { INVOCATION_ID: 'a1b2', JOURNAL_STREAM: '8:123', MANAGERPID: '1', SYSTEMD_EXEC_PID: '42' },
        {
          VSCODE_IPC_HOOK_CLI: '/run/vscode.sock',
          VSCODE_GIT_IPC_HANDLE: '/run/git.sock',
          GIT_ASKPASS: '/a'
        },
        {
          COPILOT_CLI: '1',
          COPILOT_AGENT_SESSION_ID: 'session-2',
          COPILOT_LOADER_PID: '77',
          WT_SESSION: 'w'
        },
        { PATH: `${base.PATH}${path.delimiter}${base.PATH}` },
        { TERM: undefined, PWD: undefined }
      ]) {
        expect(await getHashAsync({ ...base, ...volatile })).toBe(baseHash);
      }
      for (const relevant of [
        { FOO: '1' },
        // Declaring a plugin daemon-compatible changes which plugins the engine applies.
        { RUSH_DAEMON_COMPATIBLE_PLUGINS: 'rush-example-plugin' },
        { RUSH_BUILD_CACHE_ENABLED: '1' },
        { RUSH_BUILD_CACHE_WRITE_ALLOWED: '0' },
        { RUSH_DAEMON_WATCH: '1' },
        { RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400' },
        { NODE_OPTIONS: '--max-old-space-size=8192' },
        { NPM_CONFIG_REGISTRY: 'https://example.invalid/' },
        { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' },
        { PATH: '/usr/bin:/usr/local/bin' },
        { PATH: ['/opt/node/bin', '/usr/local/bin', '/usr/bin'].join(path.delimiter) },
        { HOME: '/home/other' }
      ]) {
        expect(await getHashAsync({ ...base, ...relevant })).not.toBe(baseHash);
      }
      expect(getWorkspaceFingerprintEnvironmentEntries({ ...base, OLDPWD: '/x', FOO: undefined })).toEqual([
        ['HOME', '/home/user'],
        ['PATH', '/usr/local/bin:/usr/bin']
      ]);
      const repeatedPath: string = ['/a', '/b', '/a', '', '/c', '', '/b'].join(path.delimiter);
      expect(getWorkspaceFingerprintEnvironmentEntries({ PATH: repeatedPath })).toEqual([
        ['PATH', ['/a', '/b', '', '/c'].join(path.delimiter)]
      ]);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('keeps request-scoped variables out of a host environment', () => {
    const environment: Record<string, string | undefined> = {
      HOME: '/home/user',
      RUSH_PARALLELISM: '48',
      COPILOT_AGENT_SESSION_ID: 'session-1',
      RUSHD_OUTPUT: 'agent',
      RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400',
      UNSET: undefined
    };
    expect(getWorkspaceHostEnvironment(environment)).toEqual({
      HOME: '/home/user',
      RUSHD_OUTPUT: 'agent',
      RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400'
    });
    for (const name of workspaceRequestScopedEnvironmentVariables) {
      expect(workspaceFingerprintIgnoredEnvironmentVariables.has(name)).toBe(true);
    }
  });

  it("gives operations the request's values of variables that are not host identity", () => {
    const hostEnvironment: Record<string, string | undefined> = {
      HOME: '/home/user',
      PATH: '/usr/bin',
      NODE_OPTIONS: '--max-old-space-size=8192',
      COPILOT_AGENT_SESSION_ID: 'session-A',
      COPILOT_CLI: '1',
      GIT_ASKPASS: '/window-A/askpass.sh',
      WT_SESSION: 'wt-A',
      UNSET: undefined
    };
    const requestEnvironment: Record<string, string | undefined> = {
      HOME: '/home/other',
      PATH: '/other/bin',
      COPILOT_AGENT_SESSION_ID: 'session-B',
      RUSH_PARALLELISM: '2',
      WT_SESSION: 'wt-B',
      RUSH_INVOKED_FOLDER: '/repo/apps/b',
      TERM: undefined
    };
    expect(getWorkspaceRequestOperationEnvironment(hostEnvironment, requestEnvironment)).toEqual({
      HOME: '/home/user',
      PATH: '/usr/bin',
      NODE_OPTIONS: '--max-old-space-size=8192',
      COPILOT_AGENT_SESSION_ID: 'session-B',
      RUSH_PARALLELISM: '2',
      WT_SESSION: 'wt-B',
      RUSH_INVOKED_FOLDER: '/repo/apps/b'
    });
    expect(getWorkspaceRequestOperationEnvironment(hostEnvironment, {})).toEqual({
      HOME: '/home/user',
      PATH: '/usr/bin',
      NODE_OPTIONS: '--max-old-space-size=8192'
    });
  });

  it('matches request variable names case-insensitively on Windows', () => {
    const platform: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const mixedCaseSessionVariable: string = 'Copilot_Agent_Session_Id';
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    try {
      expect(
        getWorkspaceRequestOperationEnvironment(
          { Path: 'C:\\bin', [mixedCaseSessionVariable]: 'session-A' },
          { Path: 'D:\\bin', COPILOT_AGENT_SESSION_ID: 'session-B' }
        )
      ).toEqual({ Path: 'C:\\bin', COPILOT_AGENT_SESSION_ID: 'session-B' });
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('classifies content, configuration and process-bound identities', () => {
    const current: IWorkspaceInputFingerprint = {
      configurationHash: 'configuration',
      environmentHash: 'environment',
      installationHash: 'installation',
      runtimeHash: 'runtime',
      selectedRushVersion: '5.179.0'
    };
    expect(classifyWorkspaceInputChange(current, { ...current })).toBe(WorkspaceInputChangeTier.Reuse);
    expect(classifyWorkspaceInputChange(current, { ...current, configurationHash: 'changed' })).toBe(
      WorkspaceInputChangeTier.Reload
    );
    for (const changed of [
      { environmentHash: 'changed' },
      { installationHash: 'changed' },
      { runtimeHash: 'changed' },
      { selectedRushVersion: '5.180.0' }
    ]) {
      expect(classifyWorkspaceInputChange(current, { ...current, ...changed })).toBe(
        WorkspaceInputChangeTier.Restart
      );
    }
  });

  it('retains content identity across touches and catches same-size runtime edits with restored mtime', () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const filename: string = path.join(folder, 'runtime.js');
      fs.writeFileSync(filename, 'module.exports = 1;\n');
      const cache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const original: string = cache._hashPaths([folder]);
      expect(cache.changedPaths).toEqual([]);
      const times: fs.Stats = fs.statSync(filename);
      fs.utimesSync(filename, times.atime, new Date(times.mtimeMs + 1000));
      expect(cache._hashPaths([folder])).toBe(original);
      expect(cache.changedPaths).toEqual([]);
      fs.writeFileSync(filename, 'module.exports = 2;\n');
      fs.utimesSync(filename, times.atime, times.mtime);
      expect(cache._hashPaths([folder])).not.toBe(original);
      expect(cache.changedPaths).toEqual([filename]);
      fs.writeFileSync(path.join(folder, 'added.js'), 'module.exports = 3;\n');
      const added: string = cache._hashPaths([folder]);
      expect(cache.changedPaths).toEqual([filename, path.join(folder, 'added.js')]);
      fs.rmSync(path.join(folder, 'added.js'));
      expect(cache._hashPaths([folder])).not.toBe(added);
      expect(cache.changedPaths).toEqual([filename]);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('ignores operation state inside a project nested in common/config but not its definitions', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    try {
      const write = (relativePath: string, content: string): void => {
        const filename: string = path.join(folder, relativePath);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
      };
      write(
        'rush.json',
        JSON.stringify({
          rushVersion: '5.179.0',
          pnpmVersion: '10.27.0',
          projectFolderMaxDepth: 4,
          projects: [
            { packageName: 'pipelines', projectFolder: 'common/config/pipelines' },
            { packageName: 'inside-rush', projectFolder: 'common/config/rush/inside-rush' }
          ]
        })
      );
      write('common/config/pipelines/package.json', '{"name":"pipelines","version":"1.0.0"}');
      write('common/config/rush/inside-rush/package.json', '{"name":"inside-rush","version":"1.0.0"}');
      write('common/config/rush/command-line.json', '{"commands":[]}');
      write('common/config/other/settings.json', '{}');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(folder, 'rush.json')
      );
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      const captureAsync = (): Promise<IWorkspaceInputFingerprint> =>
        captureWorkspaceInputFingerprintAsync({ rushConfiguration, runtimeCache, environment: {} });

      let previous: IWorkspaceInputFingerprint = await captureAsync();
      for (const relativePath of [
        'common/config/pipelines/rush-logs/pipelines._phase_build.log',
        'common/config/pipelines/.rush/temp/operation/_phase_build/state.json',
        'common/config/pipelines/lib/index.js',
        'common/config/pipelines/config/heft.json'
      ]) {
        write(relativePath, String(Math.random()));
        const next: IWorkspaceInputFingerprint = await captureAsync();
        expect(next.configurationHash).toBe(previous.configurationHash);
        expect(classifyWorkspaceInputChange(previous, next)).toBe(WorkspaceInputChangeTier.Reuse);
      }
      for (const [relativePath, content] of [
        ['common/config/pipelines/package.json', '{"name":"pipelines","version":"1.0.1"}'],
        ['common/config/pipelines/config/rush-project.json', '{"operationSettings":[]}'],
        ['common/config/pipelines/config/rig.json', '{"rigPackageName":"rig"}'],
        ['common/config/rush/command-line.json', '{"commands":[],"parameters":[]}'],
        ['common/config/rush/inside-rush/rush-logs/inside-rush._phase_build.log', 'log'],
        ['common/config/other/settings.json', '{"changed":true}']
      ]) {
        write(relativePath, content);
        const next: IWorkspaceInputFingerprint = await captureAsync();
        expect(classifyWorkspaceInputChange(previous, next)).toBe(WorkspaceInputChangeTier.Reload);
        previous = next;
      }
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
