// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize } from '@rushstack/terminal';

import { RushConstants } from '../logic/RushConstants';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';

export class RushStartupBanner {
  public static logBanner(rushVersion: string, isManaged: boolean): void {
    const nodeVersion: string = _formatNodeVersion();
    const versionSuffix: string = rushVersion ? ' ' + _formatRushVersion(rushVersion, isManaged) : '';

    // eslint-disable-next-line no-console
    console.log(
      '\n' +
        Colorize.bold(`Rush Multi-Project Build Tool${versionSuffix}`) +
        Colorize.cyan(` - ${RushConstants.rushWebSiteUrl}`) +
        `\nNode.js version is ${nodeVersion}\n`
    );
  }

  public static logStreamlinedBanner(rushVersion: string, isManaged: boolean): void {
    const nodeVersion: string = _formatNodeVersion();
    const versionSuffix: string = rushVersion ? ' ' + _formatRushVersion(rushVersion, isManaged) : '';

    // eslint-disable-next-line no-console
    console.log(Colorize.bold(`Rush Multi-Project Build Tool${versionSuffix}`) + ` - Node.js ${nodeVersion}`);
  }
}

function _formatNodeVersion(): string {
  const nodeVersion: string = process.versions.node;
  const nodeReleaseLabel: string = NodeJsCompatibility.isOddNumberedVersion
    ? 'unstable'
    : NodeJsCompatibility.isLtsVersion
      ? 'LTS'
      : 'pre-LTS';
  return `${nodeVersion} (${nodeReleaseLabel})`;
}

function _formatRushVersion(rushVersion: string, isManaged: boolean): string {
  return rushVersion + Colorize.yellow(isManaged ? '' : ' (unmanaged)');
}
