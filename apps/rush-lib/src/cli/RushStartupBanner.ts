// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import colors from 'colors/safe';

import { RushConstants } from '../logic/RushConstants';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';

export class RushStartupBanner {
  public static log(rushVersion: string, isManaged: boolean): void {
    const nodeVersion: string = process.versions.node;
    const nodeReleaseLabel: string = NodeJsCompatibility.isOddNumberedVersion
      ? 'unstable'
      : NodeJsCompatibility.isLtsVersion
      ? 'LTS'
      : 'pre-LTS';

    const versionSuffix: string = rushVersion ? ' ' + this._formatVersion(rushVersion, isManaged) : '';

    console.log(
      EOL +
        colors.bold(`Rush Multi-Project Build Tool${versionSuffix}`) +
        colors.cyan(` - ${RushConstants.rushWebSiteUrl}`) +
        EOL +
        `Node.js version is ${nodeVersion} (${nodeReleaseLabel})` +
        EOL
    );
  }

  private static _formatVersion(rushVersion: string, isManaged: boolean): string {
    return rushVersion + colors.yellow(isManaged ? '' : ' (unmanaged)');
  }
}
