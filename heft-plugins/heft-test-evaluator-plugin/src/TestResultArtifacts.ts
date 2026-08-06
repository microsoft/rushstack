// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ICoverageThresholds {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
}

export interface ICoverageThresholdArtifact {
  version: 1;
  global: ICoverageThresholds;
}

export const DEFAULT_JUNIT_ARTIFACT_RELATIVE_PATH: string = 'test-results/junit.xml';
export const DEFAULT_COVERAGE_THRESHOLDS_ARTIFACT_RELATIVE_PATH: string =
  'test-results/coverage-thresholds.json';
