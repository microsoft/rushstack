// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodePath from 'node:path';

import { AlreadyReportedError, Path } from '@rushstack/node-core-library';
import type { LookupByPath } from '@rushstack/lookup-by-path';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser.ts';
import { RushConstants } from '../RushConstants.ts';

export class PathProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _workingDirectory: string;

  public constructor(rushConfiguration: RushConfiguration, workingDirectory: string) {
    this._rushConfiguration = rushConfiguration;
    this._workingDirectory = workingDirectory;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    parameterName
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    // Resolve the input path against the working directory
    const absolutePath: string = nodePath.resolve(this._workingDirectory, unscopedSelector);

    // Relativize it to the rushJsonFolder
    const relativePath: string = nodePath.relative(this._rushConfiguration.rushJsonFolder, absolutePath);

    // Normalize path separators to forward slashes for LookupByPath
    const normalizedPath: string = Path.convertToSlashes(relativePath);

    // Get the LookupByPath instance for the Rush root
    const lookupByPath: LookupByPath<RushConfigurationProject> =
      this._rushConfiguration.getProjectLookupForRoot(this._rushConfiguration.rushJsonFolder);

    // Check if this path is within a project or matches a project exactly
    const containingProject: RushConfigurationProject | undefined =
      lookupByPath.findChildPath(normalizedPath);

    if (containingProject) {
      return [containingProject];
    }

    // Check if there are any projects under this path (i.e., it's a directory containing projects)
    const projectsUnderPath: Set<RushConfigurationProject> = new Set();
    for (const [, project] of lookupByPath.entries(normalizedPath)) {
      projectsUnderPath.add(project);
    }

    if (projectsUnderPath.size > 0) {
      return projectsUnderPath;
    }

    // No projects found
    terminal.writeErrorLine(
      `The path "${unscopedSelector}" passed to "${parameterName}" does not match any project in ` +
        `${RushConstants.rushJsonFilename}. The resolved path relative to the Rush root is "${relativePath}".`
    );
    throw new AlreadyReportedError();
  }

  public getCompletions(): Iterable<string> {
    // Return empty completions as path completions are typically handled by the shell
    return [];
  }
}
