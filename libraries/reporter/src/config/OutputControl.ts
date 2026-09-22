// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A parsed `--output` control target.
 *
 * @beta
 */
export interface IReporterOutputTarget {
  /**
   * The reporter scheme, for example `file` or `json`.
   */
  readonly reporter: string;

  /**
   * The destination target, for example a file path.
   */
  readonly target: string;

  /**
   * The query parameters, for example `logLevel=debug`.
   */
  readonly params: { readonly [key: string]: string };
}

const OUTPUT_CONTROL_REGEXP: RegExp = /^([a-z][a-z0-9]*):\/\/(.*)$/i;

/**
 * Parses a `--output` control of the form `<reporter>://<target>?key=value`.
 *
 * @param value - the raw `--output` value
 * @throws Error if the value is not a valid output control
 *
 * @beta
 */
export function parseOutputControl(value: string): IReporterOutputTarget {
  const match: RegExpExecArray | null = OUTPUT_CONTROL_REGEXP.exec(value);
  if (!match) {
    throw new Error(`Invalid --output control: ${JSON.stringify(value)}`);
  }

  const reporter: string = match[1];
  const rest: string = match[2];
  const params: { [key: string]: string } = {};

  let target: string = rest;
  const queryIndex: number = rest.indexOf('?');
  if (queryIndex >= 0) {
    target = rest.slice(0, queryIndex);
    for (const pair of rest.slice(queryIndex + 1).split('&')) {
      if (pair.length === 0) {
        continue;
      }
      const equalsIndex: number = pair.indexOf('=');
      if (equalsIndex >= 0) {
        params[pair.slice(0, equalsIndex)] = pair.slice(equalsIndex + 1);
      } else {
        params[pair] = '';
      }
    }
  }

  return { reporter, target, params };
}
