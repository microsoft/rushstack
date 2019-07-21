// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';

import { RushConfiguration } from '../api/RushConfiguration';

/**
 * This constant is the major version of the next LTS node Node.js release. This constant should be updated when
 * a new LTS version is added to Rush's support matrix.
 */
const UPCOMING_NODE_LTS_VERSION: number = 12;
const nodeVersion: string = process.versions.node;

/**
 * This class provides useful functions for warning if the current Node.js runtime isn't supported.
 *
 * @internal
 */
export class NodeJsCompatibility {
  public static warnAboutVersionTooOld(): boolean {
    if (semver.satisfies(nodeVersion, '< 8.9.0')) {
      // We are on an ancient version of Node.js that is known not to work with Rush
      console.error(colors.red(
        `Your version of Node.js (${nodeVersion}) is very old and incompatible with Rush. ` +
        `Please upgrade to the latest Long-Term Support (LTS) version.`
      ));

      return true;
    } else {
      return false;
    }
  }

  public static warnAboutVersionTooNew(isRushLib: boolean): boolean {
    if (semver.satisfies(nodeVersion, `>= ${UPCOMING_NODE_LTS_VERSION + 1}.0.0`)) {
      // We are on a much newer release than we have tested and support
      if (isRushLib) {
        console.warn(colors.yellow(
          `Your version of Node.js (${nodeVersion}) has not been tested with this release` +
          `of the Rush engine. Please consider upgrading the "rushVersion" setting in rush.json, ` +
          `or downgrading Node.js.`
        ));
      } else {
        console.warn(colors.yellow(
          `Your version of Node.js (${nodeVersion}) has not been tested with this release ` +
          `of Rush. Please consider installing a newer version of the "@microsoft/rush" ` +
          `package, or downgrading Node.js.`
        ));
      }

      return true;
    } else {
      return false;
    }
  }

  public static warnAboutNonLtsVersion(rushConfiguration: RushConfiguration | undefined): boolean {
   if (
      rushConfiguration &&
      !rushConfiguration.suppressNodeLtsWarning &&
      !NodeJsCompatibility.isLtsVersion
    ) {
      console.warn(colors.yellow(
        `Your version of Node.js (${nodeVersion}) is an odd-numbered release. ` +
        `These releases frequently have bugs. Please consider installing a Long Term Support (LTS) ` +
        `version instead.`
      ));

      return true;
    } else {
      return false;
    }
  }

  public static get isLtsVersion(): boolean {
    interface IExtendedNodeProcess extends NodeJS.Process {
      release: {
        lts?: string;
      };
    }

     return !!(process as IExtendedNodeProcess).release.lts;
  }
}
