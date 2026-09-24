// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IRigConfig } from '@rushstack/rig-package';
import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

import { CoreConfigFiles, type IHeftConfigurationJson } from '../../utilities/CoreConfigFiles';
import { HeftConfiguration, getRigConfigForConfigLoading } from '../HeftConfiguration';
import { describeValue, replaceAll, writeFiles } from './ConfigTestUtilities';

const REPO_ROOT: string = path.resolve(__dirname, '../../../../..');
interface ILoadOutcome {
  value?: unknown;
  error?: string;
  debugOutput: string;
}

async function createHeftConfigurationAsync(projectPath: string): Promise<HeftConfiguration> {
  const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
    cwd: projectPath,
    terminalProvider: new StringBufferTerminalProvider(true),
    numberOfCores: 1
  });
  await heftConfiguration._checkForRigAsync();
  return heftConfiguration;
}

function createTerminal(): { terminal: ITerminal; provider: StringBufferTerminalProvider } {
  const provider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
  return { terminal: new Terminal(provider), provider };
}

async function loadOriginalAsync(projectPath: string, rigConfig: IRigConfig): Promise<ILoadOutcome> {
  const { terminal, provider } = createTerminal();
  try {
    const value: IHeftConfigurationJson = await CoreConfigFiles._loadHeftConfigurationFileOriginalAsync(
      terminal,
      projectPath,
      rigConfig
    );
    return { value: describeValue(value), debugOutput: provider.getDebugOutput() };
  } catch (e) {
    return { error: (e as Error).message, debugOutput: provider.getDebugOutput() };
  }
}

function loadLean(projectPath: string, rigConfig: IRigConfig): ILoadOutcome | undefined {
  const { terminal, provider } = createTerminal();
  const value: IHeftConfigurationJson | undefined = CoreConfigFiles._tryLoadHeftConfigurationFileLean(
    terminal,
    projectPath,
    rigConfig
  );
  return value === undefined ? undefined : { value: describeValue(value), debugOutput: provider.getDebugOutput() };
}

/**
 * Loads the project's heft.json with both implementations, and checks the contract: the lean implementation either
 * declines, or produces exactly the same result and debug output. Returns whether the lean path was taken.
 *
 * @param freshCopyPath - An identical copy of the project, used to check the public entry point. The original
 * implementation caches results (including failures) per path, so a second load of the same path would not
 * produce the same debug output.
 */
async function expectEquivalentAsync(
  projectPath: string,
  freshCopyPath?: string
): Promise<{ lean: boolean; original: ILoadOutcome }> {
  // Like InternalHeftSession: the original implementation gets the genuine RigConfig, and the lean path gets
  // getRigConfigForConfigLoading()
  const heftConfiguration: HeftConfiguration = await createHeftConfigurationAsync(projectPath);
  const rigConfig: IRigConfig = heftConfiguration.rigConfig;
  const original: ILoadOutcome = await loadOriginalAsync(projectPath, rigConfig);
  const lean: ILoadOutcome | undefined = loadLean(
    projectPath,
    getRigConfigForConfigLoading(await createHeftConfigurationAsync(projectPath))
  );
  if (lean) {
    expect({ projectPath, ...lean }).toEqual({ projectPath, ...original });
  }

  // The public entry point must behave exactly like the original implementation
  const combinedPath: string = freshCopyPath ?? projectPath;
  const combinedRigConfig: IRigConfig = getRigConfigForConfigLoading(
    await createHeftConfigurationAsync(combinedPath)
  );
  const { terminal, provider } = createTerminal();
  let combined: ILoadOutcome;
  try {
    const value: IHeftConfigurationJson = await CoreConfigFiles.loadHeftConfigurationFileForProjectAsync(
      terminal,
      combinedPath,
      combinedRigConfig
    );
    combined = { value: describeValue(value), debugOutput: provider.getDebugOutput() };
  } catch (e) {
    combined = { error: (e as Error).message, debugOutput: provider.getDebugOutput() };
  }

  if (freshCopyPath) {
    combined = replaceAll(combined, freshCopyPath, projectPath);
  } else if (!lean) {
    // The original implementation returns its cached failure without logging again
    combined.debugOutput = original.debugOutput;
  }

  expect({ projectPath, ...combined }).toEqual({ projectPath, ...original });
  return { lean: !!lean, original };
}

// Loading every build-test project with the original implementation takes a while
jest.setTimeout(300000);

describe('Lean heft.json loading', () => {
  let tempFolder: string;
  let fixtureCounter: number = 0;

  beforeAll(() => {
    tempFolder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'heft-lean-config-')));
  });

  afterAll(() => {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  });

  function createFixture(files: Record<string, string | object>, suffix: string = ''): string {
    const projectFolder: string = path.join(tempFolder, `fixture-${fixtureCounter}${suffix}`);
    writeFiles(projectFolder, {
      'package.json': { name: 'fixture', version: '1.0.0' },
      'node_modules/fake-plugin/package.json': { name: 'fake-plugin', version: '1.0.0' },
      'node_modules/other-plugin/package.json': { name: 'other-plugin', version: '1.0.0' },
      ...files
    });
    return projectFolder;
  }

  async function expectFixtureEquivalentAsync(
    files: Record<string, string | object>
  ): Promise<{ lean: boolean; original: ILoadOutcome }> {
    fixtureCounter++;
    const projectFolder: string = createFixture(files);
    const freshCopyFolder: string = createFixture(files, '-copy');
    return await expectEquivalentAsync(projectFolder, freshCopyFolder);
  }

  it('matches the original loader for every build-test project in the repo', async () => {
    const buildTestsFolder: string = path.join(REPO_ROOT, 'build-tests');
    let projectCount: number = 0;
    let leanCount: number = 0;
    for (const projectName of fs.readdirSync(buildTestsFolder)) {
      const projectPath: string = path.join(buildTestsFolder, projectName);
      if (
        !fs.existsSync(path.join(projectPath, 'node_modules')) ||
        (!fs.existsSync(path.join(projectPath, 'config/heft.json')) &&
          !fs.existsSync(path.join(projectPath, 'config/rig.json')))
      ) {
        continue;
      }

      projectCount++;
      const { lean, original } = await expectEquivalentAsync(projectPath);
      if (lean) {
        leanCount++;
      } else {
        // The lean path may only decline when the original fails
        expect({ projectPath, error: original.error !== undefined }).toEqual({ projectPath, error: true });
      }
    }

    expect(projectCount).toBeGreaterThan(10);
    expect(leanCount).toBeGreaterThan(10);
  });

  it('matches the original loader for extends chains and inheritance annotations', async () => {
    const { lean } = await expectFixtureEquivalentAsync({
      'config/heft.json': `// A comment
      {
        "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
        "extends": "./base/heft.json",
        "heftPlugins": [{ "pluginPackage": "other-plugin", "options": { "a": [3] } }],
        "aliasesByName": {
          "$start.inheritanceType": "replace",
          "start": { "actionName": "build-watch", "defaultParameters": ["--serve"] }
        },
        "phasesByName": {
          "build": {
            "cleanFiles": [{ "includeGlobs": ["lib-esm"] }],
            "tasksByName": {
              "typescript": {
                "taskPlugin": {
                  "pluginPackage": "fake-plugin",
                  "options": { "$list.inheritanceType": "replace", "list": [2], "nested": { "b": 2 } }
                }
              },
              "lint": null,
            },
          },
          "$test.inheritanceType": "replace",
          "test": { "phaseDependencies": ["build"] }
        }
      }`,
      'config/base/heft.json': {
        extends: 'fake-plugin/heft-base.json',
        heftPlugins: [{ pluginPackage: '@rushstack/heft', pluginName: 'x' }],
        aliasesByName: { start: { actionName: 'start-old' }, other: { actionName: 'build' } },
        phasesByName: {
          build: {
            phaseDescription: 'Build',
            cleanFiles: [{ includeGlobs: ['lib'] }],
            tasksByName: {
              typescript: {
                taskPlugin: {
                  pluginPackage: 'fake-plugin',
                  options: { list: [1], nested: { a: 1 }, keep: true }
                }
              },
              lint: { taskDependencies: ['typescript'], taskPlugin: { pluginPackage: 'other-plugin' } }
            }
          },
          test: { tasksByName: { jest: { taskPlugin: { pluginPackage: 'fake-plugin' } } } }
        }
      },
      'node_modules/fake-plugin/heft-base.json': {
        phasesByName: { lint: { tasksByName: { eslint: { taskPlugin: { pluginPackage: 'fake-plugin' } } } } }
      }
    });
    expect(lean).toBe(true);
  });

  it('matches the original loader when heft.json comes from a rig', async () => {
    const { lean, original } = await expectFixtureEquivalentAsync({
      'config/rig.json': { rigPackageName: 'test-rig', rigProfile: 'library' },
      'node_modules/test-rig/package.json': { name: 'test-rig', version: '1.0.0' },
      'node_modules/test-rig/node_modules/rig-plugin/package.json': { name: 'rig-plugin', version: '1.0.0' },
      'node_modules/test-rig/profiles/library/config/heft.json': {
        extends: './heft-shared.json',
        phasesByName: { build: { tasksByName: { rigged: { taskPlugin: { pluginPackage: 'rig-plugin' } } } } }
      },
      'node_modules/test-rig/profiles/library/config/heft-shared.json': {
        heftPlugins: [{ pluginPackage: 'test-rig' }]
      }
    });
    expect(lean).toBe(true);
    expect(original.debugOutput).toContain('Attempting to load via rig');
  });

  it('matches the original loader for a symlinked (pnpm-style) rig package', async () => {
    const rigFiles: Record<string, string | object> = {
      'package.json': { name: 'linked-rig', version: '1.0.0' },
      'node_modules/linked-rig-plugin/package.json': { name: 'linked-rig-plugin', version: '1.0.0' },
      'profiles/default/config/heft.json': {
        heftPlugins: [{ pluginPackage: 'linked-rig-plugin' }, { pluginPackage: 'linked-rig' }],
        phasesByName: { build: { tasksByName: { t: { taskPlugin: { pluginPackage: 'linked-rig-plugin' } } } } }
      }
    };
    fixtureCounter++;
    const projectFolders: string[] = [];
    for (const suffix of ['', '-copy']) {
      const projectFolder: string = createFixture({ 'config/rig.json': { rigPackageName: 'linked-rig' } }, suffix);
      // Like pnpm, the package lives elsewhere and node_modules contains a symlink to it
      const rigStoreFolder: string = path.join(projectFolder, '.store/linked-rig');
      writeFiles(rigStoreFolder, rigFiles);
      fs.symlinkSync(rigStoreFolder, path.join(projectFolder, 'node_modules/linked-rig'), 'junction');
      projectFolders.push(projectFolder);
    }

    const { lean, original } = await expectEquivalentAsync(projectFolders[0], projectFolders[1]);
    expect(lean).toBe(true);
    // The rig profile folder is reported via the symlink, while plugin packages resolve to real paths
    expect(original.debugOutput).toContain(path.join(projectFolders[0], 'node_modules/linked-rig/profiles/default'));
  });

  it('declines for JSON5 syntax, and the combined loader matches the original', async () => {
    for (const files of [
      { 'config/heft.json': "{ 'phasesByName': { build: { phaseDescription: 'x', }, }, }" },
      { 'config/heft.json': '\ufeff{ "phasesByName": {} }' }
    ]) {
      const { lean, original } = await expectFixtureEquivalentAsync(files);
      expect({ files, lean, failed: original.error !== undefined }).toEqual({ files, lean: false, failed: false });
    }
  });

  it('declines for every error condition, and the combined loader reports the original error', async () => {
    const errorFixtures: Record<string, string | object>[] = [
      // Missing heft.json, without and with a rig
      {},
      { 'config/rig.json': { rigPackageName: 'missing-rig' } },
      {
        'config/rig.json': { rigPackageName: 'empty-rig' },
        'node_modules/empty-rig/package.json': { name: 'empty-rig', version: '1.0.0' },
        'node_modules/empty-rig/profiles/default/.keep': ''
      },
      // A missing rig profile (the original reports "The rig profile ... is not defined by the rig package")
      {
        'config/rig.json': { rigPackageName: 'profile-rig', rigProfile: 'nope' },
        'node_modules/profile-rig/package.json': { name: 'profile-rig', version: '1.0.0' },
        'node_modules/profile-rig/profiles/default/config/heft.json': {}
      },
      {
        'config/rig.json': '{ "rigPackageName": "profile-rig", "rigProfile": 5 }',
        'node_modules/profile-rig/package.json': { name: 'profile-rig', version: '1.0.0' },
        'node_modules/profile-rig/profiles/default/config/heft.json': {}
      },
      // Syntax errors (jju rejects a raw U+2028 in a string, but JSON.parse() would accept it)
      { 'config/heft.json': '{ "phasesByName": { ' },
      { 'config/heft.json': '{ "phasesByName": { "build": { "phaseDescription": "a\u2028b" } } }' },
      // Schema violations, including the legacy schema
      { 'config/heft.json': { phasesByName: { Build: {} } } },
      { 'config/heft.json': { unknownProperty: true } },
      { 'config/heft.json': { eventActions: [{ actionKind: 'copyFiles', heftEvent: 'pre-compile' }] } },
      { 'config/heft.json': { phasesByName: { build: { tasksByName: { t: {} } } } } },
      // Plugin resolution failures
      {
        'config/heft.json': {
          phasesByName: { build: { tasksByName: { t: { taskPlugin: { pluginPackage: 'missing' } } } } }
        }
      },
      {
        'config/heft.json': {
          phasesByName: { build: { tasksByName: { t: { taskPlugin: { pluginPackage: 'Bad Name' } } } } }
        }
      },
      { 'config/heft.json': { heftPlugins: [{ pluginPackage: 5 }] } },
      // extends problems
      { 'config/heft.json': { extends: './missing.json' } },
      { 'config/heft.json': { extends: 'missing-package/heft.json' } },
      { 'config/heft.json': { extends: './heft.json' } },
      { 'config/heft.json': { extends: './a.json' }, 'config/a.json': { extends: './heft.json' } },
      // Inheritance annotation problems
      { 'config/heft.json': { '$phasesByName.inheritanceType': 'replace' } },
      { 'config/heft.json': { '$phasesByName.inheritanceType': 'bogus', phasesByName: {} } },
      { 'config/heft.json': { '$phasesByName.inheritanceType': 1, phasesByName: {} } },
      {
        'config/heft.json': { extends: './base.json', phasesByName: { build: { cleanFiles: { x: 1 } } } },
        'config/base.json': { phasesByName: { build: { cleanFiles: [] } } }
      }
    ];
    for (const files of errorFixtures) {
      const { lean, original } = await expectFixtureEquivalentAsync(files);
      expect({ files, lean, failed: original.error !== undefined }).toEqual({ files, lean: false, failed: true });
    }
  });
});
