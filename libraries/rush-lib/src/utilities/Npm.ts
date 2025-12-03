// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import { Utilities } from './Utilities';

export class Npm {
  public static async getPublishedVersionsAsync(
    packageName: string,
    cwd: string,
    env: { [key: string]: string | undefined },
    extraArgs: string[] = []
  ): Promise<string[]> {
    const versions: string[] = [];
    try {
      const packageTime: string = await Utilities.executeCommandAndCaptureOutputAsync(
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
        const packageVersions: string = await Utilities.executeCommandAndCaptureOutputAsync(
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
    } catch (e) {
      const error: Error = e;
      if (['E404', 'npm ERR! 404'].some((check) => error.message.indexOf(check))) {
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
