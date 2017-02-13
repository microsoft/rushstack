// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import TaskError from './TaskError';

export enum ErrorDetectionMode {
  LocalBuild = 1,
  VisualStudio = 2,
  VisualStudioOnline = 3
}

export interface IErrorDetectionRule {
  (line: string): TaskError;
}

/**
 * Creates an Error Detection Rule based on a regex and a function which converts a regex match to a TaskError
 */
export function RegexErrorDetector(regex: RegExp,
    getError: (match: RegExpExecArray) => TaskError): IErrorDetectionRule {

  return (line: string): TaskError => {
    const match: RegExpExecArray = regex.exec(line);
    if (match) {
      return getError(match);
    }
    return undefined;
  };
}

/**
 * The error detector will find all errors in a chunk of text by running a number
 * of error detection rules against each line of text.
 * @todo #168353: add unit tests for the ErrorDetector & for each individual rule in rules/
 */
export default class ErrorDetector {
  private _rules: IErrorDetectionRule[];

  constructor(rules: IErrorDetectionRule[]) {
    this._rules = rules;
  }

  public execute(data: string): TaskError[] {
    const errors: TaskError[] = [];
    data.split('\n').forEach((line: string) => {
      const error: TaskError = this._checkLine(line);
      if (error) {
        errors.push(error);
      }
    });
    return errors;
  }

  private _checkLine(line: string): TaskError {
    for (const rule of this._rules) {
      const error: TaskError = rule(line);
      if (error) {
        return error;
      }
    }
    return undefined;
  }
}
