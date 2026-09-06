// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The environment variable that indicates the GitHub Copilot CLI agent.
 *
 * @beta
 */
export const COPILOT_CLI_ENV_VAR: 'COPILOT_CLI' = 'COPILOT_CLI';

/**
 * The environment variables that indicate a recognized CI environment.
 *
 * @beta
 */
export const KNOWN_CI_ENV_VARS: readonly string[] = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'TF_BUILD',
  'JENKINS_URL',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'TEAMCITY_VERSION',
  'APPVEYOR',
  'CODEBUILD_BUILD_ID',
  'BITBUCKET_BUILD_NUMBER'
];

/**
 * Returns `true` if an agent or CI environment variable is active.
 *
 * @remarks
 * A variable is active when defined and not equal, case-insensitively, to an
 * empty string, `0`, `false`, `no`, or `off`.
 *
 * @param value - the environment variable value
 *
 * @beta
 */
export function isAgentVariableActive(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized: string = value.trim().toLowerCase();
  return !(
    normalized === '' ||
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'off'
  );
}

/**
 * Returns `true` if an agent is detected from `COPILOT_CLI` or a configured
 * agent environment variable.
 *
 * @param env - the environment variables
 * @param configuredVariables - agent variable names configured in rush.json
 *
 * @beta
 */
export function detectAgent(
  env: Record<string, string | undefined>,
  configuredVariables: readonly string[] = []
): boolean {
  if (isAgentVariableActive(env[COPILOT_CLI_ENV_VAR])) {
    return true;
  }
  for (const name of configuredVariables) {
    if (isAgentVariableActive(env[name])) {
      return true;
    }
  }
  return false;
}

/**
 * Returns `true` if a recognized CI environment is detected.
 *
 * @param env - the environment variables
 *
 * @beta
 */
export function isCiDetected(env: Record<string, string | undefined>): boolean {
  for (const name of KNOWN_CI_ENV_VARS) {
    if (isAgentVariableActive(env[name])) {
      return true;
    }
  }
  return false;
}
