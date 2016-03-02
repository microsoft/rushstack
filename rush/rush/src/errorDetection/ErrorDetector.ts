/**
 * @file ErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Defines a utility which registers a set of error detection rules that can be executed against
 * the output of an application.
 */

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
export function RegexErrorDetector(regex: RegExp, getError: (match: RegExpExecArray) => TaskError): IErrorDetectionRule {
  return (line: string): TaskError => {
    let match = regex.exec(line);
    if (match) {
      return getError(match);
    }
    return undefined;
  };
}

/**
 * The error detector will find all errors in a chunk of text by running a number
 * of error detection rules against each line of text.
 */
export default class ErrorDetector {
  private _rules: IErrorDetectionRule[];

  constructor(rules: IErrorDetectionRule[]) {
    this._rules = rules;
  }

  public execute(data: string) {
    const errors: TaskError[] = [];
    data.split('\n').forEach((line: string) => {
      const error = this._checkLine(line);
      if (error) {
        errors.push(error);
      }
    });
    return errors;
  }

  private _checkLine(line: string): TaskError {
    for (const rule of this._rules) {
      const error = rule(line);
      if (error) {
        return error;
      }
    }
    return undefined;
  }
}
