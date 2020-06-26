// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Tslint } from '@microsoft/rush-stack-compiler-3.7';
import { IExtendedSourceFile } from './ExtendedTypescript';

type TrimmedLinter = Omit<Tslint.Linter, 'getAllFailures' | 'getEnabledRules' | 'failures'>;
export interface IExtendedLinter extends TrimmedLinter {
  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L117
   */
  failures: Tslint.RuleFailure[];

  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L207-L210
   */
  getAllFailures(sourceFile: IExtendedSourceFile, enabledRules: Tslint.IRule[]): Tslint.RuleFailure[];

  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L303-L306
   */
  getEnabledRules(configuration: Tslint.Configuration.IConfigurationFile, isJs: boolean): Tslint.IRule[];
}
