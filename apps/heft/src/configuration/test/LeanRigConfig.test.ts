// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { RigConfig } from '@rushstack/rig-package';
import { StringBufferTerminalProvider } from '@rushstack/terminal';

import { HeftConfiguration, getRigConfigForConfigLoading } from '../HeftConfiguration';
import { LeanRigConfig, tryLoadRigConfigDataLean, type ILeanRigConfigData } from '../lean/LeanRigConfig';
import { writeFiles } from './ConfigTestUtilities';

const REPO_ROOT: string = path.resolve(__dirname, '../../../../..');

function getRigConfigData(rigConfig: RigConfig | LeanRigConfig): ILeanRigConfigData {
  const {
    projectFolderOriginalPath,
    projectFolderPath,
    rigFound,
    filePath,
    rigPackageName,
    rigProfile,
    relativeProfileFolderPath
  } = rigConfig;
  return {
    projectFolderOriginalPath,
    projectFolderPath,
    rigFound,
    filePath,
    rigPackageName,
    rigProfile,
    relativeProfileFolderPath
  };
}

function loadOriginal(projectFolder: string): ILeanRigConfigData | { error: string } {
  try {
    return getRigConfigData(RigConfig.loadForProjectFolder({ projectFolderPath: projectFolder, bypassCache: true }));
  } catch (e) {
    return { error: (e as Error).message };
  }
}

describe('LeanRigConfig', () => {
  let tempFolder: string;
  let counter: number = 0;

  beforeAll(() => {
    tempFolder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'heft-lean-rig-')));
  });

  afterAll(() => {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  });

  function createProject(rigJson: string | object | undefined): string {
    const projectFolder: string = path.join(tempFolder, `project-${counter++}`);
    writeFiles(projectFolder, {
      'package.json': { name: 'project', version: '1.0.0' },
      ...(rigJson !== undefined ? { 'config/rig.json': rigJson } : {})
    });
    return projectFolder;
  }

  it('reads the same data as RigConfig, or declines', () => {
    const acceptedCases: (string | object | undefined)[] = [
      undefined,
      { rigPackageName: 'example-rig' },
      { rigPackageName: '@scope/example-rig', rigProfile: 'library' },
      { $schema: 'x', rigPackageName: 'example-rig-test', rigProfile: 'a-b.c_d' },
      '// A comment\n{ "rigPackageName": "example-rig", }',
      '{ "rigPackageName": "first-rig", "rigPackageName": "second-rig" }'
    ];
    for (const rigJson of acceptedCases) {
      const projectFolder: string = createProject(rigJson);
      expect({ rigJson, data: tryLoadRigConfigDataLean(projectFolder) }).toEqual({
        rigJson,
        data: loadOriginal(projectFolder)
      });
    }

    // RigConfig either throws for these, or jju produces a different object than JSON.parse()
    const declinedCases: (string | object)[] = [
      {},
      { rigPackageName: 'not-a-rig-package' },
      { rigPackageName: 'bad name-rig' },
      { rigPackageName: 'example-rig', rigProfile: 'Bad' },
      { rigPackageName: 'example-rig', rigProfile: 5 },
      { rigPackageName: 'example-rig', unknownField: true },
      { rigPackageName: 'example-rig', constructor: 1 },
      '{ "__proto__": {}, "rigPackageName": "example-rig" }',
      "{ rigPackageName: 'example-rig' }",
      '{ "rigPackageName": ',
      '[]'
    ];
    for (const rigJson of declinedCases) {
      const projectFolder: string = createProject(rigJson);
      expect({ rigJson, data: tryLoadRigConfigDataLean(projectFolder) }).toEqual({ rigJson, data: undefined });
    }
  });

  it('reads the same data as RigConfig for every project in the repo', () => {
    let count: number = 0;
    for (const topFolder of ['apps', 'build-tests', 'heft-plugins', 'libraries']) {
      const topFolderPath: string = path.join(REPO_ROOT, topFolder);
      for (const projectName of fs.readdirSync(topFolderPath)) {
        const projectFolder: string = path.join(topFolderPath, projectName);
        if (fs.existsSync(path.join(projectFolder, 'package.json'))) {
          count++;
          const data: ILeanRigConfigData | undefined = tryLoadRigConfigDataLean(projectFolder);
          expect({ projectFolder, data }).toEqual({ projectFolder, data: loadOriginal(projectFolder) });
        }
      }
    }

    expect(count).toBeGreaterThan(50);
  });

  it('keeps HeftConfiguration.rigConfig a genuine RigConfig', async () => {
    const projectFolder: string = createProject({ rigPackageName: 'example-rig', rigProfile: 'library' });
    writeFiles(projectFolder, {
      'node_modules/example-rig/package.json': { name: 'example-rig', version: '1.0.0' },
      'node_modules/example-rig/profiles/library/config/x.json': '{}'
    });
    const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
      cwd: projectFolder,
      terminalProvider: new StringBufferTerminalProvider(),
      numberOfCores: 1
    });
    expect(() => heftConfiguration.rigConfig).toThrow(/cannot be accessed until/);
    await heftConfiguration._checkForRigAsync();

    const leanRigConfig: unknown = getRigConfigForConfigLoading(heftConfiguration);
    expect(leanRigConfig).toBeInstanceOf(LeanRigConfig);

    const rigConfig: RigConfig = heftConfiguration.rigConfig as RigConfig;
    expect(rigConfig).toBeInstanceOf(RigConfig);
    // The same object as other callers get from @rushstack/rig-package's cache
    expect(rigConfig).toBe(RigConfig.loadForProjectFolder({ projectFolderPath: heftConfiguration.buildFolderPath }));
    expect(heftConfiguration.rigConfig).toBe(rigConfig);
    expect(getRigConfigData(leanRigConfig as LeanRigConfig)).toEqual(getRigConfigData(rigConfig));

    // The methods of the lean object delegate to the genuine object
    expect((leanRigConfig as LeanRigConfig).getResolvedProfileFolder()).toEqual(rigConfig.getResolvedProfileFolder());
    expect((leanRigConfig as LeanRigConfig).tryResolveConfigFilePath('config/x.json')).toEqual(
      path.join(projectFolder, 'node_modules/example-rig/profiles/library/config/x.json')
    );
  });

  it('reports rig.json errors like the original implementation', async () => {
    const projectFolder: string = createProject({ rigPackageName: 'not-a-rig-package' });
    const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
      cwd: projectFolder,
      terminalProvider: new StringBufferTerminalProvider(),
      numberOfCores: 1
    });
    const original: { error: string } = loadOriginal(projectFolder) as { error: string };
    await expect(heftConfiguration._checkForRigAsync()).rejects.toThrow(original.error);
  });
});
