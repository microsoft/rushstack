// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Path } from '@rushstack/node-core-library';
import { ProjectImpactGraphGenerator } from '../ProjectImpactGraphGenerator';
import { RushConfiguration } from '../../api/RushConfiguration';
import { Stopwatch } from '../../utilities/Stopwatch';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

const NORMALIZED_DIRNAME: string = Path.convertToSlashes(__dirname);

async function runTestForExampleRepoAsync(
  repoName: string,
  testFn: (generator: ProjectImpactGraphGenerator) => Promise<void>
): Promise<void> {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
  const terminal: Terminal = new Terminal(terminalProvider);
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    `${NORMALIZED_DIRNAME}/${repoName}/rush.json`
  );

  const generator: ProjectImpactGraphGenerator = new ProjectImpactGraphGenerator(terminal, rushConfiguration);
  await testFn(generator);

  expect(
    terminalProvider.getAllOutputAsChunks({
      normalizeSpecialCharacters: true,
      asLines: true
    })
  ).toMatchSnapshot('Terminal Output');
}

describe(ProjectImpactGraphGenerator.name, () => {
  describe(ProjectImpactGraphGenerator.prototype.generateAsync.name, () => {
    beforeEach(() => {
      jest.spyOn(Stopwatch.prototype, 'duration', 'get').mockReturnValue(1.5);
    });

    it.each(['workspacePackages', 'packages', 'repo'])(
      'Correctly generates a project impact graph (repo: "%p")',
      async (repoName) =>
        await runTestForExampleRepoAsync(repoName, async (generator) => {
          const writeFileAsyncSpy: jest.SpyInstance = jest
            .spyOn(FileSystem, 'writeFileAsync')
            .mockImplementation();

          await generator.generateAsync();

          expect(writeFileAsyncSpy).toHaveBeenCalledTimes(1);
          expect(
            Path.convertToSlashes(writeFileAsyncSpy.mock.calls[0][0]).replace(
              `${NORMALIZED_DIRNAME}/${repoName}`,
              '<REPO_ROOT>'
            )
          ).toMatchSnapshot('Output file path');
          expect(writeFileAsyncSpy.mock.calls[0][1]).toMatchSnapshot('Output file data');
        })
    );
  });

  describe(ProjectImpactGraphGenerator.prototype.validateAsync.name, () => {
    it.each(['workspacePackages'])(
      'Reports if the project-impact-graph.yaml file is missing (repo: "%p")',
      async (repoName) =>
        await runTestForExampleRepoAsync(repoName, async (generator) => {
          await expect(generator.validateAsync()).resolves.toBe(false);
        })
    );
  });
});
