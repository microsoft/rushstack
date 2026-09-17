// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DynamicCommandLineAction } from '@rushstack/ts-command-line';
import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { ProjectChangeAnalyzer } from '../../../logic/ProjectChangeAnalyzer';
import type { IGitSelectorParserOptions } from '../../../logic/selectors/GitChangedProjectSelectorParser';
import { SelectionParameterSet } from '../SelectionParameterSet';

describe(SelectionParameterSet.name, () => {
  it('keeps interleaved Git selections and subsequent native selections request-local', async () => {
    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'select',
      summary: 'Select projects',
      documentation: ''
    });
    const selection: SelectionParameterSet = new SelectionParameterSet({} as RushConfiguration, action, {
      cwd: process.cwd(),
      includeSubspaceSelector: false,
      gitOptions: { includeExternalDependencies: true, enableFiltering: true }
    });
    jest
      .spyOn(action.getStringListParameter('--only'), 'values', 'get')
      .mockReturnValue(['git:first', 'git:second']);
    const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
    const project: RushConfigurationProject = {} as RushConfigurationProject;
    const firstReader = jest.fn(async () => ['first-ignore']);
    const secondReader = jest.fn(async () => ['second-ignore']);
    const createOptions = (
      reader: IGitSelectorParserOptions['getIncrementalBuildIgnoredGlobsAsync']
    ): IGitSelectorParserOptions => ({
      includeExternalDependencies: true,
      enableFiltering: true,
      getIncrementalBuildIgnoredGlobsAsync: reader
    });
    let releaseFirst!: () => void;
    const firstGate: Promise<void> = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const observed: (ReadonlyArray<string> | undefined)[] = [];
    const analyze = jest
      .spyOn(ProjectChangeAnalyzer.prototype, 'getChangedProjectsAsync')
      .mockImplementation(async ({ targetBranchName, getIncrementalBuildIgnoredGlobsAsync: reader }) => {
        if (reader === firstReader && targetBranchName === 'first') await firstGate;
        observed.push(await reader?.(project));
        return new Set([project]);
      });
    try {
      const first: Promise<Set<RushConfigurationProject>> = selection.getSelectedProjectsAsync(
        terminal,
        undefined,
        createOptions(firstReader)
      );
      await expect(
        selection.getSelectedProjectsAsync(terminal, undefined, createOptions(secondReader))
      ).resolves.toEqual(new Set([project]));
      releaseFirst();
      await expect(first).resolves.toEqual(new Set([project]));
      await expect(selection.getSelectedProjectsAsync(terminal)).resolves.toEqual(new Set([project]));
      expect(observed).toEqual([
        ['second-ignore'],
        ['second-ignore'],
        ['first-ignore'],
        ['first-ignore'],
        undefined,
        undefined
      ]);
      expect(firstReader).toHaveBeenCalledTimes(2);
      expect(secondReader).toHaveBeenCalledTimes(2);
    } finally {
      releaseFirst();
      analyze.mockRestore();
    }
  });
});
