// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTslint from 'tslint';
import type * as TTypescript from 'typescript';

type TrimmedLinter = Omit<
  TTslint.Linter,
  'getAllFailures' | 'applyAllFixes' | 'getEnabledRules' | 'failures'
>;
export interface IExtendedLinter extends TrimmedLinter {
  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L117
   */
  failures: TTslint.RuleFailure[];

  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L207-L210
   */
  getAllFailures(sourceFile: TTypescript.SourceFile, enabledRules: TTslint.IRule[]): TTslint.RuleFailure[];

  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L303-L306
   */
  getEnabledRules(configuration: TTslint.Configuration.IConfigurationFile, isJs: boolean): TTslint.IRule[];

  /**
   * https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L212-L241
   */
  applyAllFixes(
    enabledRules: TTslint.IRule[],
    fileFailures: TTslint.RuleFailure[],
    sourceFile: TTypescript.SourceFile,
    sourceFileName: string
  ): TTslint.RuleFailure[];
}
