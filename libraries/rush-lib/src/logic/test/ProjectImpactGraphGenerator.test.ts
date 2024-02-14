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

async function runTestForExampleRepoAsync(
  repoName: string,
  testFn: (
    repoBasePath: string,
    generator: ProjectImpactGraphGenerator,
    terminalProvider: StringBufferTerminalProvider
  ) => Promise<void>
): Promise<void> {
  const repoBasePath: string = `${SRC_DIRNAME}/${repoName}`;
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
  const terminal: Terminal = new Terminal(terminalProvider);
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    `${repoBasePath}/rush.json`
  );

  const generator: ProjectImpactGraphGenerator = new ProjectImpactGraphGenerator(terminal, rushConfiguration);
  await testFn(repoBasePath, generator, terminalProvider);
}

describe(ProjectImpactGraphGenerator.name, () => {
  describe(ProjectImpactGraphGenerator.prototype.generateAsync.name, () => {
    beforeEach(() => {
      jest.spyOn(Stopwatch.prototype, 'duration', 'get').mockReturnValue(1.5);
    });

    it.each(['workspacePackages', 'packages', 'repo'])(
      'Correctly generates a project impact graph (repo: "%p")',
      async (repoName) =>
        await runTestForExampleRepoAsync(repoName, async (repoBasePath, generator, terminalProvider) => {
          const writeFileAsyncSpy: jest.SpyInstance = jest
            .spyOn(FileSystem, 'writeFileAsync')
            .mockImplementation();

          await generator.generateAsync();

          expect(writeFileAsyncSpy).toHaveBeenCalledTimes(1);
          expect(writeFileAsyncSpy.mock.calls[0][0].replace(repoBasePath, '<REPO_ROOT>')).toMatchSnapshot(
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
        })
    );
  });

  describe(ProjectImpactGraphGenerator.prototype.validateAsync.name, () => {
    it.each(['workspacePackages'])(
      'Reports if the project-impact-graph.yaml file is missing (repo: "%p")',
      async (repoName) =>
        await runTestForExampleRepoAsync(repoName, async (repoBasePath, generator, terminalProvider) => {
          await expect(generator.validateAsync()).resolves.toBe(false);
        })
    );
  });
});
