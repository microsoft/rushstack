// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted when a package registry rejects the configured credentials.
 *
 * @remarks
 * Package authentication is configured per environment, so the specific
 * remediation is rarely obvious: the default action therefore propagates the
 * remediation as a prompt that an agent or user can follow.
 */
export const rdcNetworkAuthUnauthorized: IRushDiagnosticEntry<'RDC_NETWORK_AUTH_UNAUTHORIZED'> =
  defineRushDiagnostic({
    code: 'RDC_NETWORK_AUTH_UNAUTHORIZED',
    category: 'network-auth',
    defaultSeverity: 'error',
    summary: 'Authentication failed for the registry {registryUrl}.',
    remediation: [
      {
        description: 'Verify the credentials configured for the registry {registryUrl}.',
        prompt:
          'The registry {registryUrl} rejected the configured credentials. Inspect the package ' +
          'manager authentication configuration for this registry (authentication environment ' +
          'variables and any applicable .npmrc files), confirm the credential is present and has ' +
          'not expired, then retry the operation.',
        automatedExecutionSafety: 'unsafe'
      }
    ]
  });
