// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  captureWorkspaceInputFingerprintAsync,
  classifyWorkspaceInputChange,
  getWorkspaceFingerprintEnvironmentEntries,
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
        { TERM: undefined, PWD: undefined }
      ]) {
        expect(await getHashAsync({ ...base, ...volatile })).toBe(baseHash);
      }
      for (const relevant of [
        { FOO: '1' },
        { RUSH_BUILD_CACHE_ENABLED: '1' },
        { RUSH_BUILD_CACHE_WRITE_ALLOWED: '0' },
        { RUSH_DAEMON_WATCH: '1' },
        { NODE_OPTIONS: '--max-old-space-size=8192' },
        { NPM_CONFIG_REGISTRY: 'https://example.invalid/' },
        { PATH: '/usr/bin:/usr/local/bin' },
        { HOME: '/home/other' }
      ]) {
        expect(await getHashAsync({ ...base, ...relevant })).not.toBe(baseHash);
      }
      expect(getWorkspaceFingerprintEnvironmentEntries({ ...base, OLDPWD: '/x', FOO: undefined })).toEqual([
        ['HOME', '/home/user'],
        ['PATH', '/usr/local/bin:/usr/bin']
      ]);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
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
});
