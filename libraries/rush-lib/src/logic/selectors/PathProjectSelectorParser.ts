// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodePath from 'node:path';

import { AlreadyReportedError } from '@rushstack/node-core-library';
import type { LookupByPath } from '@rushstack/lookup-by-path';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { RushConstants } from '../RushConstants';

export class PathProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    parameterName
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    // Resolve the input path against the working directory
    const absolutePath: string = nodePath.resolve(process.cwd(), unscopedSelector);

    // Relativize it to the rushJsonFolder
    const relativePath: string = nodePath.relative(this._rushConfiguration.rushJsonFolder, absolutePath);

    // If the path is outside the Rush workspace, it's an error
    if (relativePath.startsWith('..') || nodePath.isAbsolute(relativePath)) {
      terminal.writeErrorLine(
        `The path "${unscopedSelector}" passed to "${parameterName}" resolves to "${absolutePath}" ` +
          `which is outside the Rush workspace root "${this._rushConfiguration.rushJsonFolder}".`
      );
      throw new AlreadyReportedError();
    }

    // Get the LookupByPath instance for the Rush root
    const lookupByPath: LookupByPath<RushConfigurationProject> =
      this._rushConfiguration.getProjectLookupForRoot(this._rushConfiguration.rushJsonFolder);

    // Try to find a project that contains this path, or all projects within this path
    const exactProject: RushConfigurationProject | undefined = lookupByPath.get(relativePath);

    if (exactProject) {
      // The path exactly matches a project folder
      return [exactProject];
    }

    // Check if this is a path within a project
    const containingProject: RushConfigurationProject | undefined = lookupByPath.findChildPath(relativePath);

    if (containingProject) {
      // The path is within a project
      return [containingProject];
    }

    // Check if there are any projects under this path (i.e., it's a directory containing projects)
    const projectsUnderPath: RushConfigurationProject[] = [];
    for (const [, project] of lookupByPath.entries(relativePath)) {
      projectsUnderPath.push(project);
    }

    if (projectsUnderPath.length > 0) {
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
