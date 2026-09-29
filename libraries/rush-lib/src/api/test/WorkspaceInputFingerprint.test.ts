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
        { ODSP_TELEMETRY_TAG: 'nightly-7' },
        // What Claude Code's Bash tool sets in every command, and with Remote Control, messaging or a
        // background session
        {
          CLAUDECODE: '1',
          CLAUDE_CODE_ENTRYPOINT: 'cli',
          CLAUDE_CODE_CHILD_SESSION: '1',
          CLAUDE_CODE_SESSION_ID: 'claude-session-2',
          CLAUDE_EFFORT: 'high',
          CLAUDE_PID: '4242'
        },
        {
          CLAUDE_CODE_BRIDGE_SESSION_ID: 'session_01bridge',
          CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/claude-1000/inbox-2.sock',
          CLAUDE_CODE_MESSAGING_TOKEN: 'token-2',
          CLAUDE_JOB_DIR: '/home/user/.claude/jobs/job-2'
        },
        { TRACEPARENT: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', TRACESTATE: 'vendor=1' },
        { PATH: `${base.PATH}${path.delimiter}${base.PATH}` },
        { TERM: undefined, PWD: undefined },
        { TMPDIR: '/scratch/job-1', XDG_RUNTIME_DIR: '/run/user/1000' },
        { TMP: 'C:\\Temp\\2', TEMP: 'C:\\Temp\\2', RUSHD_RUNTIME_DIR: '/run/rush' }
      ]) {
        expect(await getHashAsync({ ...base, ...volatile })).toBe(baseHash);
      }
      for (const relevant of [
        { FOO: '1' },
        // Declaring a plugin daemon-compatible changes which plugins the engine applies.
        { RUSH_DAEMON_COMPATIBLE_PLUGINS: 'rush-example-plugin' },
        // Declaring a plugin command-agnostic changes which commands the engine serves.
        { RUSH_DAEMON_COMMAND_AGNOSTIC_PLUGINS: 'rush-example-plugin' },
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
      ODSP_TELEMETRY_TAG: 'tag-1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'claude-session-1',
      CLAUDE_EFFORT: 'high',
      CLAUDE_PID: '4242',
      CLAUDE_CODE_BRIDGE_SESSION_ID: 'session_01bridge',
      CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/claude-1000/inbox-1.sock',
      CLAUDE_CODE_MESSAGING_TOKEN: 'token-1',
      CLAUDE_JOB_DIR: '/home/user/.claude/jobs/job-1',
      TRACEPARENT: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      TRACESTATE: 'vendor=1',
      RUSHD_OUTPUT: 'agent',
      RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400',
      TMPDIR: '/scratch/job-1',
      XDG_RUNTIME_DIR: '/run/user/1000',
      TEMP: 'C:\\Temp',
      RUSHD_RUNTIME_DIR: '/run/rush',
      UNSET: undefined
    };
    expect(getWorkspaceHostEnvironment(environment)).toEqual({
      HOME: '/home/user',
      // Markers and settings that name no session, process, folder or secret stay.
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_EFFORT: 'high',
      RUSHD_OUTPUT: 'agent',
      RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '86400',
      TEMP: 'C:\\Temp',
      RUSHD_RUNTIME_DIR: '/run/rush'
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
      ODSP_TELEMETRY_TAG: 'tag-A',
      COPILOT_CLI: '1',
      CLAUDE_CODE_SESSION_ID: 'claude-session-A',
      CLAUDE_EFFORT: 'high',
      CLAUDE_PID: '4242',
      TRACEPARENT: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      GIT_ASKPASS: '/window-A/askpass.sh',
      WT_SESSION: 'wt-A',
      UNSET: undefined
    };
    const requestEnvironment: Record<string, string | undefined> = {
      HOME: '/home/other',
      PATH: '/other/bin',
      COPILOT_AGENT_SESSION_ID: 'session-B',
      ODSP_TELEMETRY_TAG: 'tag-B',
      CLAUDE_CODE_SESSION_ID: 'claude-session-B',
      CLAUDE_EFFORT: 'max',
      TRACEPARENT: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
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
      ODSP_TELEMETRY_TAG: 'tag-B',
      CLAUDE_CODE_SESSION_ID: 'claude-session-B',
      CLAUDE_EFFORT: 'max',
      TRACEPARENT: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
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

  it('reuses the digests of definition and installation files only once they have stopped changing', async () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fingerprint-'));
    const realDateNow: () => number = Date.now;
    const readFile: jest.SpyInstance = jest.spyOn(fs.promises, 'readFile');
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
          projects: [{ packageName: 'a', projectFolder: 'a' }]
        })
      );
      write('a/package.json', '{"name":"a","version":"1.0.0"}');
      write('common/config/rush/pnpm-lock.yaml', 'lockfileVersion: 1');
      write('npmrc/a', 'registry=https://a.example/');
      write('npmrc/b', 'registry=https://b.example/');
      fs.symlinkSync(path.join(folder, 'npmrc/a'), path.join(folder, '.npmrc'));
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(folder, 'rush.json')
      );
      const packageJsonPath: string = path.join(rushConfiguration.rushJsonFolder, 'a', 'package.json');
      const runtimeCache: WorkspaceRuntimeFingerprintCache = new WorkspaceRuntimeFingerprintCache();
      /** Returns the fingerprint and the number of times that the capture read the project's package.json. */
      const captureAsync = async (): Promise<[IWorkspaceInputFingerprint, number]> => {
        readFile.mockClear();
        const fingerprint: IWorkspaceInputFingerprint = await captureWorkspaceInputFingerprintAsync({
          rushConfiguration,
          runtimeCache,
          environment: {}
        });
        return [fingerprint, readFile.mock.calls.filter(([filename]) => filename === packageJsonPath).length];
      };

      // Files that changed moments ago are read by every capture.
      const dateNow: jest.SpyInstance = jest.spyOn(Date, 'now').mockReturnValue(realDateNow());
      const [first, firstReadCount] = await captureAsync();
      expect(firstReadCount).toBe(1);
      expect(await captureAsync()).toEqual([first, 1]);
      // Once they have been unchanged for a few seconds, a capture records digests that later captures reuse.
      dateNow.mockImplementation(() => realDateNow() + 10_000);
      expect(await captureAsync()).toEqual([first, 1]);
      expect(await captureAsync()).toEqual([first, 0]);

      // An edit that keeps the file's identity, size and modification time
      fs.utimesSync(packageJsonPath, 1_000_000, 1_000_000);
      expect(await captureAsync()).toEqual([first, 1]);
      const { ctimeNs } = fs.statSync(packageJsonPath, { bigint: true });
      const probePath: string = path.join(folder, 'probe');
      do {
        // A coarse clock can give a write the same ctime as the previous one.
        fs.writeFileSync(probePath, '');
      } while (fs.statSync(probePath, { bigint: true }).ctimeNs <= ctimeNs);
      write('a/package.json', '{"name":"a","version":"1.0.1"}');
      fs.utimesSync(packageJsonPath, 1_000_000, 1_000_000);
      const [edited, editedReadCount] = await captureAsync();
      expect(editedReadCount).toBe(1);
      expect(classifyWorkspaceInputChange(first, edited)).toBe(WorkspaceInputChangeTier.Reload);
      expect(await captureAsync()).toEqual([edited, 0]);

      // A link that reaches another file
      fs.rmSync(path.join(folder, '.npmrc'));
      fs.symlinkSync(path.join(folder, 'npmrc/b'), path.join(folder, '.npmrc'));
      const [retargeted] = await captureAsync();
      expect(classifyWorkspaceInputChange(edited, retargeted)).toBe(WorkspaceInputChangeTier.Reload);
      // A file that is removed, and then created again
      fs.rmSync(packageJsonPath);
      const [removed] = await captureAsync();
      expect(classifyWorkspaceInputChange(retargeted, removed)).toBe(WorkspaceInputChangeTier.Reload);
      write('a/package.json', '{"name":"a","version":"1.0.1"}');
      expect(await captureAsync()).toEqual([retargeted, 1]);
      expect(runtimeCache.changedInstallationPaths).toEqual([]);
      // An installation file
      write('common/config/rush/pnpm-lock.yaml', 'lockfileVersion: 10');
      const [installed] = await captureAsync();
      expect(classifyWorkspaceInputChange(retargeted, installed)).toBe(WorkspaceInputChangeTier.Restart);
      const lockfilePath: string = path.join(rushConfiguration.commonRushConfigFolder, 'pnpm-lock.yaml');
      expect(runtimeCache.changedInstallationPaths).toEqual([lockfilePath]);
      // Content, not the edit, identifies the installation.
      write('common/config/rush/pnpm-lock.yaml', 'lockfileVersion: 1');
      const [restored] = await captureAsync();
      expect(restored.installationHash).toBe(first.installationHash);
      expect(runtimeCache.changedInstallationPaths).toEqual([]);
    } finally {
      jest.restoreAllMocks();
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
