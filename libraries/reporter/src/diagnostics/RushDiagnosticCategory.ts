// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The category of a Rush diagnostic.
 *
 * @remarks
 * Categories group diagnostics by root-cause domain. They are used for
 * aggregation and telemetry, and they never select the process exit code.
 *
 * @beta
 */
export type RushDiagnosticCategory =
  | 'configuration'
  | 'input'
  | 'dependency-tool'
  | 'environment'
  | 'network-auth'
  | 'operation'
  | 'internal';
