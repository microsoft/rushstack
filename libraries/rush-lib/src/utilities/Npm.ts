// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Utilities } from './Utilities';
import * as semver from 'semver';

export class Npm {
  public static publishedVersions(
    packageName: string,
    cwd: string,
    env: { [key: string]: string | undefined },
    extraArgs: string[] = []
  ): string[] {
    const versions: string[] = [];
    try {
      const packageTime: string = Utilities.executeCommandAndCaptureOutput(
        'npm',
        ['view', packageName, 'time', '--json', ...extraArgs],
        cwd,
        env,
        true
      );
      if (packageTime && packageTime !== '') {
        Object.keys(JSON.parse(packageTime)).forEach((v) => {
          if (semver.valid(v)) {
            versions.push(v);
          }
        });
      } else {
        // eslint-disable-next-line no-console
        console.log(`Package ${packageName} time value does not exist. Fall back to versions.`);
        // time property does not exist. It happens sometimes. Fall back to versions.
        const packageVersions: string = Utilities.executeCommandAndCaptureOutput(
          'npm',
          ['view', packageName, 'versions', '--json', ...extraArgs],
          cwd,
          env,
          true
        );
        if (packageVersions && packageVersions.length > 0) {
          const parsedPackageVersions: string | string[] = JSON.parse(packageVersions);
          // NPM <= 6 always returns an array, NPM >= 7 returns a string if the package has only one version available
          (Array.isArray(parsedPackageVersions) ? parsedPackageVersions : [parsedPackageVersions]).forEach(
            (version: string) => {
              versions.push(version);
            }
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(`No version is found for ${packageName}`);
        }
      }
    } catch (error) {
      if ((error as Error).message.indexOf('npm ERR! 404') >= 0) {
        // eslint-disable-next-line no-console
        console.log(`Package ${packageName} does not exist in the registry.`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`Failed to get NPM information about ${packageName}.`);
        throw error;
      }
    }
    return versions;
  }
}
