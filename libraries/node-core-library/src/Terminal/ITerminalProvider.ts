// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @beta
 */
export enum Severity {
  log,
  warn,
  error
}

/**
 * @beta
 */
export interface ITerminalProvider {
  supportsColor: boolean;
  width: number | undefined;
  write(data: string, severity: Severity): void;
}
