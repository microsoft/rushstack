// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IPublishProvider,
  IPublishProviderPublishOptions,
  IPublishProviderCheckExistsOptions
} from '@rushstack/rush-sdk';

/**
 * Publish provider that publishes packages to the npm registry.
 * @public
 */
export class NpmPublishProvider implements IPublishProvider {
  public readonly providerName: string = 'npm';

  public async publishAsync(options: IPublishProviderPublishOptions): Promise<void> {
    // TODO: Extract logic from PublishAction._npmPublishAsync() in Phase 4.3
    throw new Error('NpmPublishProvider.publishAsync is not yet implemented');
  }

  public async checkExistsAsync(options: IPublishProviderCheckExistsOptions): Promise<boolean> {
    // TODO: Extract logic from PublishAction._packageExistsAsync() in Phase 4.3
    throw new Error('NpmPublishProvider.checkExistsAsync is not yet implemented');
  }
}
