// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import { Colorize } from '@rushstack/terminal';

// Minimize dependencies to avoid compatibility errors that might be encountered before
// NodeJsCompatibility.terminateIfVersionIsTooOld() gets to run.
import type { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from './RushConstants';

/**
 * This constant is the major version of the next LTS node Node.js release. This constant should be updated when
 * a new LTS version is added to Rush's support matrix.
 *
 * LTS schedule: https://nodejs.org/en/about/releases/
 * LTS versions: https://nodejs.org/en/download/releases/
 */
const UPCOMING_NODE_LTS_VERSION: number = 24;
const nodeVersion: string = process.versions.node;
const nodeMajorVersion: number = semver.major(nodeVersion);

export interface IWarnAboutVersionTooNewOptions {
  isRushLib: boolean;

  /**
   * The CLI front-end does an early check for NodeJsCompatibility.warnAboutVersionTooNew(),
   * so this flag is used to avoid reporting the same message twice.  Note that the definition
   * of "too new" may differ between the globally installed "@microsoft/rush" front end
   * versus the "@microsoft/rush-lib" loaded by the version selector.
   */
  alreadyReportedNodeTooNewError: boolean;
}

export interface IWarnAboutCompatibilityIssuesOptions extends IWarnAboutVersionTooNewOptions {
  rushConfiguration: RushConfiguration | undefined;
}

/**
 * This class provides useful functions for warning if the current Node.js runtime isn't supported.
 *
 * @internal
 */
export class NodeJsCompatibility {
  /**
   * This reports if the Node.js version is known to have serious incompatibilities.  In that situation, the user
   * should downgrade Rush to an older release that supported their Node.js version.
   */
  public static reportAncientIncompatibleVersion(): boolean {
    // IMPORTANT: If this test fails, the Rush CLI front-end process will terminate with an error.
    // Only increment it when our code base is known to use newer features (e.g. "async"/"await") that
    // have no hope of working with older Node.js.
    if (semver.satisfies(nodeVersion, '<14.18.0')) {
      // eslint-disable-next-line no-console
      console.error(
        Colorize.red(
          `Your version of Node.js (${nodeVersion}) is very old and incompatible with Rush. ` +
            `Please upgrade to the latest Long-Term Support (LTS) version.\n`
        )
      );
      return true;
    } else {
      return false;
    }
  }

  /**
   * Detect whether the Node.js version is "supported" by the Rush maintainers.  We generally
   * only support versions that were "Long Term Support" (LTS) at the time when Rush was published.
   *
   * This is a warning only -- the user is free to ignore it and use Rush anyway.
   */
  public static warnAboutCompatibilityIssues(options: IWarnAboutCompatibilityIssuesOptions): boolean {
    // Only show the first warning
    return (
      NodeJsCompatibility.reportAncientIncompatibleVersion() ||
      NodeJsCompatibility.warnAboutVersionTooNew(options) ||
      NodeJsCompatibility._warnAboutOddNumberedVersion() ||
      NodeJsCompatibility._warnAboutNonLtsVersion(options.rushConfiguration)
    );
  }

  /**
   * Warn about a Node.js version that has not been tested yet with Rush.
   */
  public static warnAboutVersionTooNew(options: IWarnAboutVersionTooNewOptions): boolean {
    if (nodeMajorVersion >= UPCOMING_NODE_LTS_VERSION + 1) {
      if (!options.alreadyReportedNodeTooNewError) {
        // We are on a much newer release than we have tested and support
        if (options.isRushLib) {
          // eslint-disable-next-line no-console
          console.warn(
            Colorize.yellow(
              `Your version of Node.js (${nodeVersion}) has not been tested with this release ` +
                `of the Rush engine. Please consider upgrading the "rushVersion" setting in ${RushConstants.rushJsonFilename}, ` +
                `or downgrading Node.js.\n`
            )
          );
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            Colorize.yellow(
              `Your version of Node.js (${nodeVersion}) has not been tested with this release ` +
                `of Rush. Please consider installing a newer version of the "@microsoft/rush" ` +
                `package, or downgrading Node.js.\n`
            )
          );
        }
      }

      return true;
    } else {
      return false;
    }
  }

  private static _warnAboutNonLtsVersion(rushConfiguration: RushConfiguration | undefined): boolean {
    if (rushConfiguration && !rushConfiguration.suppressNodeLtsWarning && !NodeJsCompatibility.isLtsVersion) {
      // eslint-disable-next-line no-console
      console.warn(
        Colorize.yellow(
          `Your version of Node.js (${nodeVersion}) is not a Long-Term Support (LTS) release. ` +
            'These versions frequently have bugs. Please consider installing a stable release.\n'
        )
      );

      return true;
    } else {
      return false;
    }
  }

  private static _warnAboutOddNumberedVersion(): boolean {
    if (NodeJsCompatibility.isOddNumberedVersion) {
      // eslint-disable-next-line no-console
      console.warn(
        Colorize.yellow(
          `Your version of Node.js (${nodeVersion}) is an odd-numbered release. ` +
            `These releases frequently have bugs. Please consider installing a Long Term Support (LTS) ` +
            `version instead.\n`
        )
      );

      return true;
    } else {
      return false;
    }
  }

  public static get isLtsVersion(): boolean {
    return !!process.release.lts;
  }

  public static get isOddNumberedVersion(): boolean {
    return nodeMajorVersion % 2 !== 0;
  }
}
