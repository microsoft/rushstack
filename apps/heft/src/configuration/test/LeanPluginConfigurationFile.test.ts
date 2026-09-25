// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import {
  InheritanceType,
  PathResolutionMethod,
  ProjectConfigurationFile,
  type IProjectConfigurationFileSpecification
} from '@rushstack/heft-config-file';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { HeftConfiguration } from '../HeftConfiguration';
import { describeValue, replaceAll, writeFiles } from './ConfigTestUtilities';

const REPO_ROOT: string = path.resolve(__dirname, '../../../../..');

interface ILoadOutcome {
  value?: unknown;
  error?: string;
  debugOutput: string;
  frozen: boolean;
}

type SpecificationFactory = () => IProjectConfigurationFileSpecification<unknown>;

function loadSchema(relativePath: string): object | undefined {
  const schemaPath: string = path.join(REPO_ROOT, relativePath);
  return fs.existsSync(schemaPath) ? JsonFile.load(schemaPath) : undefined;
}

// Specifications like the ones that Heft plugins pass to HeftConfiguration.tryLoadProjectConfigurationFileAsync()
const typeScriptSchema: object | undefined = loadSchema(
  'heft-plugins/heft-typescript-plugin/src/schemas/typescript.schema.json'
);
const apiExtractorTaskSchema: object | undefined = loadSchema(
  'heft-plugins/heft-api-extractor-plugin/src/schemas/api-extractor-task.schema.json'
);
const specificationFactories: Record<string, SpecificationFactory> = {
  typescript: () => ({
    projectRelativeFilePath: 'config/typescript.json',
    jsonSchemaObject: typeScriptSchema!,
    propertyInheritance: {
      staticAssetsToCopy: { inheritanceType: InheritanceType.merge }
    },
    jsonPathMetadata: {
      '$.additionalModuleKindsToEmit.*.outFolderName': {
        pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
      }
    }
  }),
  apiExtractorTask: () => ({
    projectRelativeFilePath: 'config/api-extractor-task.json',
    jsonSchemaObject: apiExtractorTaskSchema!
  }),
  generic: () => ({
    projectRelativeFilePath: 'config/generic.json',
    jsonSchemaObject: {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        $schema: { type: 'string' },
        extends: { type: 'string' },
        list: { type: 'array', items: { type: 'string' } },
        map: { type: 'object' },
        nested: { type: 'object', properties: { deep: { type: 'object' } } },
        relative: { type: 'string' },
        rooted: { type: 'string' },
        module: { type: 'string' }
      }
    },
    propertyInheritanceDefaults: {
      array: { inheritanceType: InheritanceType.replace },
      object: { inheritanceType: InheritanceType.merge }
    },
    propertyInheritance: { list: { inheritanceType: InheritanceType.append } },
    jsonPathMetadata: {
      '$.relative': { pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile },
      '$.rooted': { pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot },
      '$.module': { pathResolutionMethod: PathResolutionMethod.nodeResolve },
      '$.map.*': {}
    }
  })
};

function createTerminal(): { terminal: Terminal; provider: StringBufferTerminalProvider } {
  const provider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
  return { terminal: new Terminal(provider), provider };
}

async function loadWithHeftConfigurationAsync(
  projectFolder: string,
  specification: IProjectConfigurationFileSpecification<unknown>,
  sync: boolean
): Promise<ILoadOutcome> {
  const { terminal, provider } = createTerminal();
  const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
    cwd: projectFolder,
    terminalProvider: provider,
    numberOfCores: 1
  });
  await heftConfiguration._checkForRigAsync();
  try {
    const value: unknown = sync
      ? heftConfiguration.tryLoadProjectConfigurationFile(specification, terminal)
      : await heftConfiguration.tryLoadProjectConfigurationFileAsync(specification, terminal);
    return { value: describeValue(value), debugOutput: provider.getDebugOutput(), frozen: Object.isFrozen(specification) };
  } catch (e) {
    return { error: (e as Error).message, debugOutput: provider.getDebugOutput(), frozen: Object.isFrozen(specification) };
  }
}

async function loadOriginalAsync(
  projectFolder: string,
  specification: IProjectConfigurationFileSpecification<unknown>
): Promise<ILoadOutcome> {
  const { terminal, provider } = createTerminal();
  const heftConfiguration: HeftConfiguration = HeftConfiguration.initialize({
    cwd: projectFolder,
    terminalProvider: provider,
    numberOfCores: 1
  });
  await heftConfiguration._checkForRigAsync();
  // What HeftConfiguration did before the lean path existed
  Object.freeze(specification);
  const loader: ProjectConfigurationFile<unknown> = new ProjectConfigurationFile(specification);
  try {
    const value: unknown = await loader.tryLoadConfigurationFileForProjectAsync(
      terminal,
      heftConfiguration.buildFolderPath,
      heftConfiguration.rigConfig
    );
    return { value: describeValue(value), debugOutput: provider.getDebugOutput(), frozen: true };
  } catch (e) {
    return { error: (e as Error).message, debugOutput: provider.getDebugOutput(), frozen: true };
  }
}

jest.setTimeout(120000);

describe('HeftConfiguration.tryLoadProjectConfigurationFile(Async) lean path', () => {
  let tempFolder: string;
  let fixtureCounter: number = 0;

  beforeAll(() => {
    tempFolder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'heft-lean-plugin-config-')));
  });

  afterAll(() => {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  });

  /**
   * Loads the configuration file in (separate copies of) the fixture with the original loader and with
   * HeftConfiguration (sync and async), and expects identical values, annotations, debug output, and errors.
   */
  async function expectEquivalentAsync(
    files: Record<string, string | object>,
    specificationName: string
  ): Promise<ILoadOutcome> {
    fixtureCounter++;
    const folders: string[] = ['original', 'async', 'sync'].map((kind: string) => {
      const projectFolder: string = path.join(tempFolder, `fixture-${fixtureCounter}-${kind}`);
      writeFiles(projectFolder, {
        'package.json': { name: 'fixture', version: '1.0.0' },
        'node_modules/some-package/data.json': '{}',
        ...files
      });
      return projectFolder;
    });

    const factory: SpecificationFactory = specificationFactories[specificationName];
    const original: ILoadOutcome = await loadOriginalAsync(folders[0], factory());
    const asyncOutcome: ILoadOutcome = replaceAll(
      await loadWithHeftConfigurationAsync(folders[1], factory(), false),
      folders[1],
      folders[0]
    );
    const syncOutcome: ILoadOutcome = replaceAll(
      await loadWithHeftConfigurationAsync(folders[2], factory(), true),
      folders[2],
      folders[0]
    );
    expect({ files, ...asyncOutcome }).toEqual({ files, ...original });
    expect({ files, ...syncOutcome }).toEqual({ files, ...original });
    return original;
  }

  it('matches the original loader for typescript.json and api-extractor-task.json', async () => {
    if (!typeScriptSchema || !apiExtractorTaskSchema) {
      return;
    }

    const typescriptCases: Record<string, string | object>[] = [
      {},
      { 'config/typescript.json': '// comment\n{ "onlyResolveSymlinksInNodeModules": true, }' },
      {
        'config/typescript.json': {
          extends: './base-typescript.json',
          staticAssetsToCopy: { fileExtensions: ['.png'], includeGlobs: ['a/**'] },
          additionalModuleKindsToEmit: [{ moduleKind: 'esnext', outFolderName: 'lib-esm' }]
        },
        'config/base-typescript.json': {
          staticAssetsToCopy: { fileExtensions: ['.css'], excludeGlobs: ['x'] },
          additionalModuleKindsToEmit: [{ moduleKind: 'commonjs', outFolderName: 'lib-commonjs' }]
        }
      },
      {
        'config/rig.json': { rigPackageName: 'plugin-rig' },
        'node_modules/plugin-rig/package.json': { name: 'plugin-rig', version: '1.0.0' },
        'node_modules/plugin-rig/profiles/default/config/typescript.json': { useTranspilerWorker: true }
      },
      {
        'config/rig.json': { rigPackageName: 'plugin-rig' },
        'node_modules/plugin-rig/package.json': { name: 'plugin-rig', version: '1.0.0' },
        'node_modules/plugin-rig/profiles/default/.keep': ''
      },
      // Errors
      { 'config/typescript.json': { notAnOption: true } },
      { 'config/typescript.json': '{ "useTranspilerWorker": ' },
      { 'config/typescript.json': { extends: './missing.json' } },
      { 'config/rig.json': { rigPackageName: 'missing-rig' } },
      {
        'config/rig.json': { rigPackageName: 'plugin-rig', rigProfile: 'nope' },
        'node_modules/plugin-rig/package.json': { name: 'plugin-rig', version: '1.0.0' },
        'node_modules/plugin-rig/profiles/default/.keep': ''
      }
    ];
    for (const files of typescriptCases) {
      await expectEquivalentAsync(files, 'typescript');
    }

    const apiExtractorTaskCases: Record<string, string | object>[] = [
      {},
      { 'config/api-extractor-task.json': { runInWatchMode: true } },
      { 'config/api-extractor-task.json': { runInWatchMode: 'yes' } }
    ];
    for (const files of apiExtractorTaskCases) {
      await expectEquivalentAsync(files, 'apiExtractorTask');
    }
  });

  it('matches the original loader for inheritance options and path resolution methods', async () => {
    const cases: Record<string, string | object>[] = [
      {
        'config/generic.json': {
          extends: '../base/generic.json',
          list: ['b'],
          map: { b: 2 },
          nested: { deep: { y: 1 } },
          relative: './file.txt',
          rooted: 'src',
          module: 'some-package/data.json'
        },
        'base/generic.json': { list: ['a'], map: { a: 1 }, nested: { deep: { x: 1 } }, rooted: 'lib' }
      },
      {
        'config/generic.json': {
          extends: 'some-package/data.json',
          '$list.inheritanceType': 'replace',
          list: ['c']
        }
      },
      { 'config/generic.json': { module: './local.js' } },
      // Errors
      { 'config/generic.json': { module: 'missing-package/x.json' } },
      { 'config/generic.json': { module: 'fs' } },
      { 'config/generic.json': { list: 'not-an-array' } }
    ];
    for (const files of cases) {
      await expectEquivalentAsync(files, 'generic');
    }
  });

  it('matches the original loader for the config files of the build-test projects', async () => {
    if (!typeScriptSchema) {
      return;
    }

    const buildTestsFolder: string = path.join(REPO_ROOT, 'build-tests');
    let count: number = 0;
    for (const projectName of fs.readdirSync(buildTestsFolder)) {
      const projectFolder: string = path.join(buildTestsFolder, projectName);
      if (!fs.existsSync(path.join(projectFolder, 'node_modules')) || !fs.existsSync(path.join(projectFolder, 'package.json'))) {
        continue;
      }

      count++;
      const original: ILoadOutcome = await loadOriginalAsync(projectFolder, specificationFactories.typescript());
      const lean: ILoadOutcome = await loadWithHeftConfigurationAsync(
        projectFolder,
        specificationFactories.typescript(),
        false
      );
      expect({ projectFolder, ...lean }).toEqual({ projectFolder, ...original });
    }

    expect(count).toBeGreaterThan(10);
  });
});
