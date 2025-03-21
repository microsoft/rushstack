// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import {
  ChainedTokenCredential,
  VisualStudioCodeCredential,
  AzureCliCredential,
  AzureDeveloperCliCredential,
  AzurePowerShellCredential,
  InteractiveBrowserCredential,
  DeviceCodeCredential
} from '@azure/identity';
import type { TokenCredentialOptions } from '@azure/identity';
import { AdoCodespacesAuthCredential } from './AdoCodespacesAuthCredential';

export class ChainedCredential extends ChainedTokenCredential {
  public constructor(options: TokenCredentialOptions) {
    super(
      new AdoCodespacesAuthCredential(),
      new VisualStudioCodeCredential(options),
      new AzureCliCredential(options),
      new AzureDeveloperCliCredential(options),
      new AzurePowerShellCredential(options),
      new InteractiveBrowserCredential(options),
      new DeviceCodeCredential(options)
    );
  }
}
