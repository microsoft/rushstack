// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { ProjectConfigurationFile } from '@rushstack/heft-config-file';

import { HeftConfiguration } from '../HeftConfiguration';

interface ITestConfig {
  name?: string;
  list?: string[];
}

const TEST_CONFIG_SCHEMA: object = {
  type: 'object',
  additionalProperties: false,
  properties: {
    $schema: { type: 'string' },
    extends: { type: 'string' },
    name: { type: 'string' },
    list: { type: 'array', items: { type: 'string' } }
  }
};

// Any loader instance can read the source-file annotation that heft-config-file attaches to loaded objects
const ANNOTATION_READER: ProjectConfigurationFile<object> = new ProjectConfigurationFile<object>({
  projectRelativeFilePath: 'config/unused.json',
  jsonSchemaObject: {}
});

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, undefined, 2));
}

// Exercises the public HeftConfiguration surface that plugins rely on, against a real project folder.
describe(HeftConfiguration.name, () => {
  let rootFolder: string;
  let projectFolder: string;

  beforeEach(() => {
    rootFolder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'heft-configuration-test-')));
    projectFolder = path.join(rootFolder, 'project');
    writeJson(path.join(projectFolder, 'package.json'), { name: 'test-project', version: '1.2.3' });
    const rigFolder: string = path.join(projectFolder, 'node_modules', 'test-rig');
    writeJson(path.join(rigFolder, 'package.json'), { name: 'test-rig', version: '1.0.0' });
    writeJson(path.join(rigFolder, 'profiles', 'default', 'config', 'test.json'), {
      name: 'from-rig',
      list: ['rig']
    });
  });

  afterEach(() => {
    fs.rmSync(rootFolder, { recursive: true, force: true });
  });

  function initialize(cwd: string = projectFolder): HeftConfiguration {
    return HeftConfiguration.initialize({
      cwd,
      terminalProvider: new StringBufferTerminalProvider(),
      numberOfCores: 3
    });
  }

  it('resolves the build folder from a nested working directory', () => {
    const nested: string = path.join(projectFolder, 'src', 'deep');
    fs.mkdirSync(nested, { recursive: true });
    const configuration: HeftConfiguration = initialize(nested);

    expect(configuration.buildFolderPath).toBe(projectFolder);
    expect(configuration.projectConfigFolderPath).toBe(path.join(projectFolder, 'config'));
    expect(configuration.tempFolderPath).toBe(path.join(projectFolder, 'temp'));
    expect(configuration.slashNormalizedBuildFolderPath).toBe(projectFolder.split(path.sep).join('/'));
    expect(configuration.numberOfCores).toBe(3);
    expect(configuration.projectPackageJson.name).toBe('test-project');
    expect(configuration.projectPackageJson.version).toBe('1.2.3');
    expect(configuration.heftPackageJson.name).toBe('@rushstack/heft');
  });

  it('throws the documented error outside of a project folder', () => {
    const outside: string = path.join(rootFolder, 'no-project');
    fs.mkdirSync(outside);
    expect(() => initialize(outside)).toThrow('No package.json file found. Are you in a project folder?');
  });

  it('requires _checkForRigAsync() before rigConfig is accessed', async () => {
    const configuration: HeftConfiguration = initialize();
    expect(() => configuration.rigConfig).toThrow(/checkForRigAsync/);
    await configuration._checkForRigAsync();
    expect(configuration.rigConfig.rigFound).toBe(false);
  });

  it('loads a riggable configuration file from the rig when the project does not provide one', async () => {
    writeJson(path.join(projectFolder, 'config', 'rig.json'), { rigPackageName: 'test-rig' });
    const configuration: HeftConfiguration = initialize();
    await configuration._checkForRigAsync();
    expect(configuration.rigConfig.rigFound).toBe(true);
    expect(configuration.rigConfig.rigPackageName).toBe('test-rig');
    expect(configuration.rigConfig.rigProfile).toBe('default');

    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    const options: {
      projectRelativeFilePath: string;
      jsonSchemaObject: object;
      propertyInheritance: { list: { inheritanceType: 'append' } };
    } = {
      projectRelativeFilePath: 'config/test.json',
      jsonSchemaObject: TEST_CONFIG_SCHEMA,
      propertyInheritance: { list: { inheritanceType: 'append' } }
    };

    const fromRig: ITestConfig | undefined = await configuration.tryLoadProjectConfigurationFileAsync<ITestConfig>(
      options,
      terminal
    );
    expect(plain(fromRig)).toEqual({ name: 'from-rig', list: ['rig'] });
    // Loaded objects are annotated with their source file (used by plugins via getObjectSourceFilePath)
    expect(ANNOTATION_READER.getObjectSourceFilePath(fromRig!)).toBe(
      path.join(projectFolder, 'node_modules', 'test-rig', 'profiles', 'default', 'config', 'test.json')
    );
    expect(plain(configuration.tryLoadProjectConfigurationFile<ITestConfig>(options, terminal))).toEqual(
      plain(fromRig)
    );
    // The options object is frozen by the first load
    expect(Object.isFrozen(options)).toBe(true);
  });

  it('applies "extends" with the requested property inheritance', async () => {
    writeJson(path.join(projectFolder, 'config', 'base.json'), { name: 'base', list: ['a', 'b'] });
    writeJson(path.join(projectFolder, 'config', 'test.json'), { extends: './base.json', list: ['c'] });
    const configuration: HeftConfiguration = initialize();
    await configuration._checkForRigAsync();

    const loaded: ITestConfig | undefined = await configuration.tryLoadProjectConfigurationFileAsync<ITestConfig>(
      {
        projectRelativeFilePath: 'config/test.json',
        jsonSchemaObject: TEST_CONFIG_SCHEMA,
        propertyInheritance: { list: { inheritanceType: 'append' } }
      },
      new Terminal(new StringBufferTerminalProvider())
    );
    expect(plain(loaded)).toEqual({ name: 'base', list: ['a', 'b', 'c'] });
    expect(ANNOTATION_READER.getObjectSourceFilePath(loaded!)).toBe(
      path.join(projectFolder, 'config', 'test.json')
    );
  });

  it('returns undefined when the file does not exist and there is no rig', async () => {
    const configuration: HeftConfiguration = initialize();
    await configuration._checkForRigAsync();
    expect(
      await configuration.tryLoadProjectConfigurationFileAsync<ITestConfig>(
        { projectRelativeFilePath: 'config/missing.json', jsonSchemaObject: TEST_CONFIG_SCHEMA },
        new Terminal(new StringBufferTerminalProvider())
      )
    ).toBeUndefined();
  });

  it('reports schema violations', async () => {
    writeJson(path.join(projectFolder, 'config', 'test.json'), { name: 5 });
    const configuration: HeftConfiguration = initialize();
    await configuration._checkForRigAsync();
    await expect(
      configuration.tryLoadProjectConfigurationFileAsync<ITestConfig>(
        { projectRelativeFilePath: 'config/test.json', jsonSchemaObject: TEST_CONFIG_SCHEMA },
        new Terminal(new StringBufferTerminalProvider())
      )
    ).rejects.toThrow(/JSON validation failed/);
  });

  it('resolves riggable packages from the project first', async () => {
    const configuration: HeftConfiguration = initialize();
    await configuration._checkForRigAsync();
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    await expect(configuration.rigPackageResolver.resolvePackageAsync('test-rig', terminal)).resolves.toBe(
      path.join(projectFolder, 'node_modules', 'test-rig')
    );
    await expect(
      configuration.rigPackageResolver.resolvePackageAsync('no-such-package', terminal)
    ).rejects.toThrow(/Unable to resolve "no-such-package"/);
  });
});
