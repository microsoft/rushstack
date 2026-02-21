// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IRushPlugin,
  RushSession,
  RushConfiguration,
  IRushCommand,
  ILogger,
  Subspace
} from '@rushstack/rush-sdk';

/**
 * Plugin that caches information from the package manager after installation to speed up resolution of imports.
 * @beta
 */
export default class RushResolverCachePlugin implements IRushPlugin {
  public readonly pluginName: 'RushResolverCachePlugin' = 'RushResolverCachePlugin';

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    rushSession.hooks.afterInstall.tapPromise(
      this.pluginName,
      async (command: IRushCommand, subspace: Subspace, variant: string | undefined) => {
        const logger: ILogger = rushSession.getLogger('RushResolverCachePlugin');

        if (rushConfiguration.packageManager !== 'pnpm') {
          logger.emitError(
            new Error('The RushResolverCachePlugin currently only supports the "pnpm" package manager')
          );
          return;
        }

        const pnpmMajorVersion: number = parseInt(rushConfiguration.packageManagerToolVersion, 10);
        // Lockfile format parsing logic changed in pnpm v8.
        if (pnpmMajorVersion < 8) {
          logger.emitError(new Error('The RushResolverCachePlugin currently only supports pnpm version >=8'));
          return;
        }

        // This plugin is not currently webpacked, but these comments are here for future proofing.
        const { afterInstallAsync } = await import(
          /* webpackChunkMode: 'eager' */
          /* webpackExports: ["afterInstallAsync"] */
          './afterInstallAsync.ts'
        );

        await afterInstallAsync(rushSession, rushConfiguration, subspace, variant, logger);
      }
    );
  }
}
