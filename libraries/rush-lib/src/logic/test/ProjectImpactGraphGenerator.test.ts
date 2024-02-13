// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  FileSystem,
  PackageJsonLookup,
  StringBufferTerminalProvider,
  Terminal
} from '@rushstack/node-core-library';
import { ProjectImpactGraphGenerator } from '../ProjectImpactGraphGenerator';
import { RushConfiguration } from '../../api/RushConfiguration';
import { Stopwatch } from '../../utilities/Stopwatch';

const PROJECT_FOLDER_PATH: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const RELATIVE_DIRNAME: string = __dirname.replace(`${PROJECT_FOLDER_PATH}/`, '');
const SRC_DIRNAME: string = `${PROJECT_FOLDER_PATH}/src/${RELATIVE_DIRNAME.substring(
  RELATIVE_DIRNAME.indexOf('/') + 1
)}`;

describe(ProjectImpactGraphGenerator.name, () => {
  beforeEach(() => {
    jest.spyOn(Stopwatch.prototype, 'duration', 'get').mockReturnValue(1.5);
  });

  it.each(['workspacePackages', 'packages', 'repo'])(
    'Correctly generates a project impact graph (repo: "%p")',
    async (repoName) => {
      const writeFileAsyncSpy: jest.SpyInstance = jest
        .spyOn(FileSystem, 'writeFileAsync')
        .mockImplementation();

      const repoBasePath: string = `${SRC_DIRNAME}/${repoName}`;
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${repoBasePath}/rush.json`
      );

      const generator: ProjectImpactGraphGenerator = new ProjectImpactGraphGenerator(
        terminal,
        rushConfiguration
      );
      await generator.generateAsync();

      expect(writeFileAsyncSpy).toHaveBeenCalledTimes(1);
      expect(writeFileAsyncSpy.mock.calls[0][0].replace(repoBasePath, '')).toMatchSnapshot(
        'Output file path'
      );
      expect(writeFileAsyncSpy.mock.calls[0][1]).toMatchSnapshot('Output file data');

      expect({
        output: terminalProvider.getOutput({ normalizeSpecialCharacters: true }),
        verbose: terminalProvider.getVerbose({ normalizeSpecialCharacters: true }),
        error: terminalProvider.getDebugOutput({ normalizeSpecialCharacters: true }),
        warning: terminalProvider.getWarningOutput({ normalizeSpecialCharacters: true }),
        debug: terminalProvider.getDebugOutput({ normalizeSpecialCharacters: true })
      }).toMatchSnapshot('Terminal Output');
    }
  );
});
