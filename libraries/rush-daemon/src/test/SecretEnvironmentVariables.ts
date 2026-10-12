// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Matches the name of an environment variable that can hold a secret, such as `NPM_TOKEN` or `npm_config__auth`.
 * It also matches names such as `GIT_AUTHOR_NAME`, which the test fixtures don't need: they pass the commit author
 * to Git on the command line.
 */
export const SECRET_ENVIRONMENT_VARIABLE_NAME: RegExp = /TOKEN|SECRET|PASSWORD|CREDENTIAL|_AUTH/i;

/**
 * Deletes each variable whose name matches {@link SECRET_ENVIRONMENT_VARIABLE_NAME}, and returns the deleted names.
 */
export function removeSecretEnvironmentVariables(environment: NodeJS.ProcessEnv): string[] {
  const names: string[] = Object.keys(environment).filter((name: string) =>
    SECRET_ENVIRONMENT_VARIABLE_NAME.test(name)
  );
  for (const name of names) {
    delete environment[name];
  }
  return names;
}
