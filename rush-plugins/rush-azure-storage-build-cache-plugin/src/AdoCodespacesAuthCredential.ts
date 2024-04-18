// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import type { AccessToken, GetTokenOptions } from '@azure/identity';

export class AdoCodespacesAuthCredential {
  // eslint-disable-next-line @rushstack/no-new-null
  public async getToken(scopes: string | string[], options?: GetTokenOptions): Promise<AccessToken | null> {
    if (!Array.isArray(scopes)) {
      scopes = [scopes];
    }
    const { resolve } = await import('path');
    const homeDir: string | undefined = process.env.HOME;
    if (!homeDir) {
      throw new Error('Could not determine the home directory');
    }
    const azureAuthHelperExec: string = resolve(homeDir, 'azure-auth-helper');
    const { spawnSync } = await import('child_process');

    const result: string = spawnSync(azureAuthHelperExec, ['get-access-token', ...scopes], {
      encoding: 'utf8'
    }).stdout;

    return {
      token: result,
      expiresOnTimestamp: Date.now() + 3600 * 1000
    };
  }
}
