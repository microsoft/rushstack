// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { IPhase } from '../CommandLineConfiguration';
import type { RushConfigurationProject } from '../RushConfigurationProject';
import { RushProjectConfiguration } from '../RushProjectConfiguration';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripSymbolsFromObject(obj: any | undefined): void {
  if (obj) {
    for (const key of Reflect.ownKeys(obj)) {
      const value: unknown = obj[key];
      if (typeof key === 'symbol') {
        delete obj[key];
      } else if (typeof value === 'object') {
        stripSymbolsFromObject(value);
      }
    }
  }
}

async function loadProjectConfigurationAsync(
  testProjectName: string
): Promise<RushProjectConfiguration | undefined> {
  const testFolder: string = `${__dirname}/jsonFiles/${testProjectName}`;
  const rushProject: RushConfigurationProject = {
    packageName: testProjectName,
    projectFolder: testFolder,
    projectRelativeFolder: testProjectName
  } as RushConfigurationProject;
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  try {
    const rushProjectConfiguration: RushProjectConfiguration | undefined =
      await RushProjectConfiguration.tryLoadForProjectAsync(rushProject, terminal);
    if (rushProjectConfiguration?.operationSettingsByOperationName) {
      for (const operationSettings of rushProjectConfiguration.operationSettingsByOperationName.values()) {
        stripSymbolsFromObject(operationSettings);
      }
    }

    return rushProjectConfiguration;
  } catch (e) {
    const errorMessage: string = (e as Error).message
      .replace(/\\/g, '/')
      .replace(testFolder.replace(/\\/g, '/'), '<testFolder>');
    throw new Error(errorMessage);
  }
}

function validateConfiguration(rushProjectConfiguration: RushProjectConfiguration | undefined): void {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);

  if (rushProjectConfiguration) {
    try {
      rushProjectConfiguration.validatePhaseConfiguration(
        Array.from(rushProjectConfiguration.operationSettingsByOperationName.keys()).map(
          (phaseName) => ({ name: phaseName, associatedParameters: new Set() }) as IPhase
        ),
        terminal
      );
    } finally {
      expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
    }
  }
}

function validateConfigurationWithParameters(
  rushProjectConfiguration: RushProjectConfiguration | undefined,
  parameterNames: string[]
): void {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);

  if (rushProjectConfiguration) {
    try {
      // Create mock parameters with the specified names
      const mockParameters = new Set<CommandLineParameter>(
        parameterNames.map((name) => ({ longName: name }) as CommandLineParameter)
      );

      rushProjectConfiguration.validatePhaseConfiguration(
        Array.from(
          rushProjectConfiguration.operationSettingsByOperationName.keys(),
          (phaseName) => ({ name: phaseName, associatedParameters: mockParameters }) as IPhase
        ),
        terminal
      );
    } finally {
      expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
    }
  }
}

describe(RushProjectConfiguration.name, () => {
  describe(RushProjectConfiguration._tryLoadForProjectsUncachedAsync.name, () => {
    let folder: string;
    const write = (relativePath: string, json: object): void => {
      const filename: string = path.join(folder, relativePath);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, JSON.stringify(json));
    };
    const project = (name: string): RushConfigurationProject =>
      ({
        packageName: name,
        projectFolder: path.join(folder, name),
        projectRelativeFolder: name
      }) as RushConfigurationProject;
    const loadAsync = (
      ...projects: RushConfigurationProject[]
    ): Promise<ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>> =>
      RushProjectConfiguration._tryLoadForProjectsUncachedAsync(
        projects,
        new Terminal(new StringBufferTerminalProvider())
      );
    const getOutputFolderNames = (
      configuration: RushProjectConfiguration | undefined
    ): string[] | undefined => {
      const outputFolderNames: ReadonlyArray<string> | undefined =
        configuration?.operationSettingsByOperationName.get('_phase:build')?.outputFolderNames;
      return outputFolderNames && [...outputFolderNames];
    };

    beforeEach(() => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-project-rigs-'));
      for (const name of ['rigged', 'missing-profile', 'own-file']) {
        write(`${name}/package.json`, { name, version: '1.0.0' });
      }
      write('rigged/node_modules/example-rig/package.json', { name: 'example-rig', version: '1.0.0' });
      write('rigged/node_modules/example-rig/profiles/default/config/rush-project.json', {
        operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['from-rig'] }]
      });
      write('rigged/config/rig.json', { rigPackageName: 'example-rig' });
      for (const name of ['missing-profile', 'own-file']) {
        write(`${name}/node_modules/example-rig/package.json`, { name: 'example-rig', version: '1.0.0' });
        write(`${name}/config/rig.json`, { rigPackageName: 'example-rig', rigProfile: 'missing' });
      }
      write('own-file/config/rush-project.json', {
        operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['from-project'] }]
      });
    });

    afterEach(() => {
      fs.rmSync(folder, { recursive: true, force: true });
    });

    it('loads configuration from a rig profile', async () => {
      const rigged: RushConfigurationProject = project('rigged');
      const configurations = await loadAsync(rigged);
      expect(getOutputFolderNames(configurations.get(rigged))).toEqual(['from-rig']);
    });

    it('reports a missing rig profile only when the rig provides the configuration', async () => {
      await expect(loadAsync(project('missing-profile'))).rejects.toThrow(
        'The rig profile "missing" is not defined by the rig package "example-rig"'
      );
      const ownFile: RushConfigurationProject = project('own-file');
      const configurations = await loadAsync(ownFile);
      expect(getOutputFolderNames(configurations.get(ownFile))).toEqual(['from-project']);
    });
  });

  describe('operationSettingsByOperationName', () => {
    it('loads a rush-project.json config that extends another config file', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-a');
      validateConfiguration(rushProjectConfiguration);

      expect(rushProjectConfiguration?.operationSettingsByOperationName).toMatchSnapshot();
    });

    it('throws an error when loading a rush-project.json config that lists an operation twice', async () => {
      await expect(
        async () => await loadProjectConfigurationAsync('test-project-b')
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('allows outputFolderNames to be inside subfolders', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');
      validateConfiguration(rushProjectConfiguration);

      expect(rushProjectConfiguration?.operationSettingsByOperationName).toMatchSnapshot();
    });

    it('does not allow one outputFolderName to be under another', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-d');

      expect(() => validateConfiguration(rushProjectConfiguration)).toThrow();
    });

    it('validates that parameters in parameterNamesToIgnore exist for the operation', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-e');

      expect(() => validateConfiguration(rushProjectConfiguration)).toThrow();
    });

    it('validates nonexistent parameters when operation has valid parameters', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-f');

      // Provide some valid parameters for the operation
      expect(() =>
        validateConfigurationWithParameters(rushProjectConfiguration, ['--production', '--verbose'])
      ).toThrow();
    });

    it('validates mix of existent and nonexistent parameters', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-g');

      // Provide some valid parameters, test-project-g references both valid and invalid ones
      expect(() =>
        validateConfigurationWithParameters(rushProjectConfiguration, ['--production', '--verbose'])
      ).toThrow();
    });
  });

  describe(RushProjectConfiguration.prototype.getCacheDisabledReason.name, () => {
    it('Indicates if the build cache is completely disabled', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-a');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], 'z', false);
      expect(reason).toMatchSnapshot();
    });

    it('Indicates if the phase behavior is not defined', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], 'z', false);
      expect(reason).toMatchSnapshot();
    });

    it('Indicates if the phase has disabled the cache', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], '_phase:a', false);
      expect(reason).toMatchSnapshot();
    });

    it('Indicates if tracked files are outputs of the phase', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason(
        ['test-project-c/.cache/b/foo'],
        '_phase:b',
        false
      );
      expect(reason).toMatchSnapshot();
    });

    it('returns undefined if the config is safe', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([''], '_phase:b', false);
      expect(reason).toBeUndefined();
    });

    it('returns undefined if the operation is a no-op', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([''], '_phase:b', true);
      expect(reason).toBeUndefined();
    });

    it('returns reason if the operation is runnable', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], '_phase:a', false);
      expect(reason).toMatchSnapshot();
    });
  });
});
