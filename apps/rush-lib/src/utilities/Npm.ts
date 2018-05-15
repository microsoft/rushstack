// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import { Logging } from '@microsoft/node-core-library';

import { Utilities } from './Utilities';

/**
 * @public
 */
export class Npm {
  public static publishedVersions(
    packageName: string,
    cwd: string,
    env: { [key: string]: string | undefined }
  ): string[] {
    const versions: string[] = [];
    try {
      const packageTime: string = Utilities.executeCommandAndCaptureOutput('npm',
        `view ${packageName} time --json`.split(' '),
        cwd,
        env,
        true
      );
      if (packageTime && packageTime !== '') {
        Object.keys(JSON.parse(packageTime)).forEach(v => {
          if (semver.valid(v)) {
            versions.push(v);
          }
        });
      } else {
        Logging.log(`Package ${packageName} time value does not exist. Fall back to versions.`);
        // time property does not exist. It happens sometimes. Fall back to versions.
        const packageVersions: string = Utilities.executeCommandAndCaptureOutput('npm',
          `view ${packageName} versions --json`.split(' '),
          cwd,
          env,
          true
        );
        if (packageVersions && packageVersions.length > 0) {
          (JSON.parse(packageVersions)).forEach(v => {
            versions.push(v);
          });
        } else {
          Logging.log(`No version is found for ${packageName}`);
        }
      }
    } catch (error) {
      if (error.message.indexOf('npm ERR! 404') >= 0) {
        Logging.log(`Package ${packageName} does not exist in the registry.`);
      } else {
        Logging.log(`Failed to get NPM information about ${packageName}.`);
        throw error;
      }
    }
    return versions;
  }
}
