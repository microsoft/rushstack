// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageName } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { SelectorError } from './SelectorError';

export class NamedProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    context
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const project: RushConfigurationProject | undefined =
      this._rushConfiguration.findProjectByShorthandName(unscopedSelector);
    if (!project) {
      throw new SelectorError(
        `The project name "${unscopedSelector}" in ${context} does not exist in rush.json`
      );
    }

    return [project];
  }

  public getCompletions(): Iterable<string> {
    const unscopedNamesMap: Map<string, number> = new Map<string, number>();

    const scopedNames: Set<string> = new Set();
    for (const project of this._rushConfiguration.rushConfigurationJson.projects) {
      scopedNames.add(project.packageName);
      const unscopedName: string = PackageName.getUnscopedName(project.packageName);
      const count: number = unscopedNamesMap.get(unscopedName) || 0;
      unscopedNamesMap.set(unscopedName, count + 1);
    }

    const unscopedNames: string[] = [];
    for (const [unscopedName, unscopedNameCount] of unscopedNamesMap) {
      // don't suggest ambiguous unscoped names
      if (unscopedNameCount === 1 && !scopedNames.has(unscopedName)) {
        unscopedNames.push(unscopedName);
      }
    }

    return unscopedNames.sort().concat([...scopedNames].sort());
  }
}
