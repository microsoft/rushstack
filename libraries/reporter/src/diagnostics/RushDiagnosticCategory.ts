// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The set of Rush diagnostic categories known to this version of the package.
 *
 * @remarks
 * Categories group diagnostics by root-cause domain. They are used for
 * aggregation and telemetry, and they never select the process exit code.
 *
 * @beta
 */
export type KnownRushDiagnosticCategory =
  | 'configuration'
  | 'input'
  | 'dependency-tool'
  | 'environment'
  | 'network-auth'
  | 'operation'
  | 'internal';

/**
 * The category of a Rush diagnostic.
 *
 * @remarks
 * This is {@link KnownRushDiagnosticCategory} loosened with `string & {}` so
 * that a category introduced by a newer producer flows through an older
 * consumer without breaking it, per the protocol's graceful-degradation rule.
 * Known members keep autocomplete; unknown members render as-is.
 *
 * @beta
 */
export type RushDiagnosticCategory = KnownRushDiagnosticCategory | (string & {});
