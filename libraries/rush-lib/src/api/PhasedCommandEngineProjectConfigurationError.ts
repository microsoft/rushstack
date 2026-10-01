// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';

/**
 * The engine could not load the native configuration of a project.
 *
 * @remarks
 * An engine loads every project in the workspace, whereas a native command loads only the projects that it
 * selects. A native command may therefore succeed where the engine cannot, for example after a filtered
 * install that left the rig package of an unselected project uninstalled. No operation has begun.
 * @alpha
 */
export class PhasedCommandEngineProjectConfigurationError extends Error {
  /** The package name of the project whose configuration could not be loaded. */
  public readonly projectName: string;

  public constructor(projectName: string, cause: unknown) {
    // An AlreadyReportedError has written its details to the terminal; its own message adds nothing.
    const detail: string =
      cause instanceof Error && !(cause instanceof AlreadyReportedError) ? `: ${cause.message}` : '.';
    super(`Rush could not load the configuration of project "${projectName}"${detail}`, { cause });
    this.name = 'PhasedCommandEngineProjectConfigurationError';
    this.projectName = projectName;
  }
}
