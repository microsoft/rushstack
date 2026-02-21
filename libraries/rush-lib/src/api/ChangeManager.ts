// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from './RushConfiguration.ts';
import type { RushConfigurationProject } from './RushConfigurationProject.ts';
import { ChangeFile } from './ChangeFile.ts';
import type { IChangeFile } from './ChangeManagement.ts';

/**
 * A class that helps with programmatically interacting with Rush's change files.
 * @public
 */
export class ChangeManager {
  /**
   * Creates a change file that has a 'none' type.
   * @param rushConfiguration - The rush configuration we are working with
   * @param projectName - The name of the project for which to create a change file
   * @param emailAddress - The email address which should be associated with this change
   * @returns the path to the file that was created, or undefined if no file was written
   */
  public static createEmptyChangeFiles(
    rushConfiguration: RushConfiguration,
    projectName: string,
    emailAddress: string
  ): string | undefined {
    const projectInfo: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(projectName);
    if (projectInfo && projectInfo.shouldPublish) {
      const changefile: IChangeFile = {
        changes: [
          {
            comment: '',
            packageName: projectName,
            type: 'none'
          }
        ],
        packageName: projectName,
        email: emailAddress
      };

      return new ChangeFile(changefile, rushConfiguration).writeSync();
    }
    return undefined;
  }
}
