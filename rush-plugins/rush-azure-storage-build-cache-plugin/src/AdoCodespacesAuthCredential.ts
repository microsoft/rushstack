// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CredentialUnavailableError,
  type AccessToken,
  type GetTokenOptions,
  type TokenCredential
} from '@azure/identity';

import { Executable } from '@rushstack/node-core-library';

interface IDecodedJwt {
  header: {
    type?: string;
    alg?: string;
    kid?: string;
  };
  payload: {
    aud?: string;
    iss?: string;
    iat?: number;
    nbf?: number;
    exp?: number;
    appid?: string;
    scp?: string;
    upn?: string;
    unique_name?: string;
    tid?: string;
    sub?: string;
    ver?: string;
  };
  signature: string;
}

/**
 * AdoCodespacesAuthCredential uses "Azure Devops Codespaces Authentication" VSCode extension to get the access
 * tokens for AAD in Codespaces.
 * https://github.com/microsoft/ado-codespaces-auth
 */
export class AdoCodespacesAuthCredential implements TokenCredential {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public async getToken(scopes: string | [string], options?: GetTokenOptions): Promise<AccessToken> {
    try {
      let scope: string;
      if (Array.isArray(scopes)) {
        if (scopes.length > 1) {
          throw new Error('Only one scope is supported');
        } else if ((scopes as string[]).length === 0) {
          throw new Error('A scope must be provided.');
        } else {
          scope = scopes[0];
        }
      } else {
        scope = scopes;
      }
      const azureAuthHelperExec: string = 'azure-auth-helper';

      const token: string = Executable.spawnSync(azureAuthHelperExec, [
        'get-access-token',
        scope
      ]).stdout.trim();

      let expiresOnTimestamp: number;

      try {
        const decodedToken: IDecodedJwt = this._decodeToken(token);
        if (decodedToken?.payload?.exp) {
          expiresOnTimestamp = decodedToken.payload.exp * 1000;
        } else {
          expiresOnTimestamp = Date.now() + 3600000;
        }
      } catch (error) {
        throw new Error(`Failed to decode the token: ${error}`);
      }

      return {
        token,
        expiresOnTimestamp
      };
    } catch (error) {
      throw new CredentialUnavailableError(
        `Failed to get token from Azure DevOps Codespaces Authentication: ${error.message}`
      );
    }
  }

  private _decodeToken(token: string): IDecodedJwt {
    const parts: string[] = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token');
    }

    const header: string = Buffer.from(parts[0], 'base64').toString();
    const payload: string = Buffer.from(parts[1], 'base64').toString();
    const signature: string = parts[2];

    return {
      header: JSON.parse(header),
      payload: JSON.parse(payload),
      signature
    };
  }
}
