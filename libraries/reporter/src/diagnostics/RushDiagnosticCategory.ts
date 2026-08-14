// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The category of a Rush diagnostic.
 *
 * @remarks
 * Categories group diagnostics by root-cause domain. They are used for
 * aggregation and telemetry, and they never select the process exit code.
 *
 * The set is intentionally small and additive: as more producers adopt
 * structured diagnostics, new categories are expected so that remediation
 * branches can be more specific. Widening this union is a non-breaking change,
 * so consumers must not treat it as exhaustive (for example, always provide a
 * fallback branch when switching over categories).
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
