// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { IPhase } from '../CommandLineConfiguration.ts';
import type { RushConfigurationProject } from '../RushConfigurationProject.ts';
import { RushProjectConfiguration } from '../RushProjectConfiguration.ts';

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

      expect(() => validateConfiguration(rushProjectConfiguration)).toThrowError();
    });

    it('validates that parameters in parameterNamesToIgnore exist for the operation', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-e');

      expect(() => validateConfiguration(rushProjectConfiguration)).toThrowError();
    });

    it('validates nonexistent parameters when operation has valid parameters', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-f');

      // Provide some valid parameters for the operation
      expect(() =>
        validateConfigurationWithParameters(rushProjectConfiguration, ['--production', '--verbose'])
      ).toThrowError();
    });

    it('validates mix of existent and nonexistent parameters', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-g');

      // Provide some valid parameters, test-project-g references both valid and invalid ones
      expect(() =>
        validateConfigurationWithParameters(rushProjectConfiguration, ['--production', '--verbose'])
      ).toThrowError();
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
