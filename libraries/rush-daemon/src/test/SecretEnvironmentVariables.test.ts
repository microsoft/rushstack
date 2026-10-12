// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  removeSecretEnvironmentVariables,
  SECRET_ENVIRONMENT_VARIABLE_NAME
} from './SecretEnvironmentVariables';

describe(removeSecretEnvironmentVariables.name, () => {
  it('deletes the variables whose names can hold a secret and keeps the others', () => {
    const environment: NodeJS.ProcessEnv = Object.fromEntries([
      ['NPM_TOKEN', 'fake-1'],
      ['node_auth_token', 'fake-2'],
      ['APP_SECRET', 'fake-3'],
      ['DB_PASSWORD', 'fake-4'],
      ['AZURE_CREDENTIALS', 'fake-5'],
      ['npm_config__auth', 'fake-6'],
      ['PATH', '/usr/bin'],
      ['RUSHD_ENV_MARKER', 'kept']
    ]);

    expect(removeSecretEnvironmentVariables(environment)).toEqual([
      'NPM_TOKEN',
      'node_auth_token',
      'APP_SECRET',
      'DB_PASSWORD',
      'AZURE_CREDENTIALS',
      'npm_config__auth'
    ]);
    expect(environment).toEqual({ PATH: '/usr/bin', RUSHD_ENV_MARKER: 'kept' });
  });

  it('has run on process.env before this test file loaded', () => {
    const names: string[] = Object.keys(process.env).filter((name: string) =>
      SECRET_ENVIRONMENT_VARIABLE_NAME.test(name)
    );
    expect(names).toEqual([]);
  });
});
