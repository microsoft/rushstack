// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, IPackageJson } from '@rushstack/node-core-library';
import { RushConfiguration } from '../../api/RushConfiguration';

/**
 * The `context` parameter passed to {@link IPnpmFileModule.hooks.readPackage}, as defined by the
 * pnpmfile.js API contract.
 */
interface IPnpmFileModuleContext {
  log: (message: string) => void;
}

/**
 * The callback signature for {@link IPnpmFileModule.hooks.readPackage}
 */
type ReadPackageHook = (packageJson: IPackageJson, context: IPnpmFileModuleContext) => IPackageJson;

/**
 * Describes the module contract for the pnpmfile.js config file, when it is loaded using Node.js require().
 */
interface IPnpmFileModule {
  hooks?: {
    readPackage?: ReadPackageHook;
  };
}

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files.
 */
export class PnpmfileConfiguration {
  private _readPackageHook: ReadPackageHook | undefined = undefined;
  private _context: IPnpmFileModuleContext;

  public constructor(rushConfiguration: RushConfiguration) {
    this._context = {
      log: (message: string) => {}
    };

    // Avoid setting the hook when not using pnpm or when using pnpm workspaces, since workspaces mode
    // already transforms the package.json
    if (
      rushConfiguration.packageManager === 'pnpm' &&
      (!rushConfiguration.pnpmOptions || !rushConfiguration.pnpmOptions.useWorkspaces)
    ) {
      const pnpmFilePath: string = rushConfiguration.getPnpmfilePath();
      if (FileSystem.exists(pnpmFilePath)) {
        console.log('Loading ' + path.relative(rushConfiguration.rushJsonFolder, pnpmFilePath));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pnpmFileModule: IPnpmFileModule = require(pnpmFilePath);
        if (pnpmFileModule.hooks && pnpmFileModule.hooks.readPackage) {
          this._readPackageHook = pnpmFileModule.hooks.readPackage;
        }
      }
    }
  }

  /**
   * Transform a package.json file using the pnpmfile.js hook.
   * @returns the tranformed object, or the original input if pnpmfile.js was not found.
   */
  public transform(packageJson: IPackageJson): IPackageJson {
    if (!this._readPackageHook) {
      return packageJson;
    } else {
      return this._readPackageHook(packageJson, this._context);
    }
  }
}
