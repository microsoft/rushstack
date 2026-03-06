// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser.ts';
import { RushConstants } from '../RushConstants.ts';

export class TagProjectSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    parameterName
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    const selection: ReadonlySet<RushConfigurationProject> | undefined =
      this._rushConfiguration.projectsByTag.get(unscopedSelector);
    if (!selection) {
      terminal.writeErrorLine(
        `The tag "${unscopedSelector}" passed to "${parameterName}" is not specified for any projects in ` +
          `${RushConstants.rushJsonFilename}.`
      );
      throw new AlreadyReportedError();
    }
    return selection;
  }

  public getCompletions(): Iterable<string> {
    return this._rushConfiguration.projectsByTag.keys();
  }
}
