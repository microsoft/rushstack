// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as path from 'path';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IEvaluateSelectorOptions, ISelectorParser } from './ISelectorParser';
import { SelectorError } from './SelectorError';
import { SelectorExpression } from '../../api/SelectorExpressions';
import { SelectorExpressionJsonFile } from '../../api/SelectorExpressionJsonFile';
import { IRushProjectSelector } from '../../api/IRushProjectSelector';

export class JsonFileSelectorParser implements ISelectorParser<RushConfigurationProject> {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _projectSelector: IRushProjectSelector;

  public constructor(rushConfiguration: RushConfiguration, projectSelector: IRushProjectSelector) {
    this._rushConfiguration = rushConfiguration;
    this._projectSelector = projectSelector;
  }

  public async evaluateSelectorAsync({
    unscopedSelector,
    terminal,
    context
  }: IEvaluateSelectorOptions): Promise<Iterable<RushConfigurationProject>> {
    let expr: SelectorExpression | undefined;

    if (unscopedSelector === '-') {
      const stdinAsString: string = fs.readFileSync(process.stdin.fd, 'utf8');
      expr = SelectorExpressionJsonFile.loadFromString(stdinAsString);
    } else {
      const absolutePath: string = this.getAbsolutePath(unscopedSelector);
      const expr: SelectorExpression | undefined = await SelectorExpressionJsonFile.tryLoadAsync(
        absolutePath
      );

      if (!expr) {
        throw new SelectorError(`Unable to find JSON file at "${absolutePath}" in ${context}.`);
      }
    }

    return this._projectSelector.selectExpression(expr!, `JSON file ${unscopedSelector} in ${context}`);
  }

  public getCompletions(): Iterable<string> {
    return [];
  }

  public getAbsolutePath(file: string): string {
    if (file.startsWith('.')) {
      return path.resolve(process.cwd(), file);
    } else {
      return path.resolve(this._rushConfiguration.rushJsonFolder, file);
    }
  }
}
