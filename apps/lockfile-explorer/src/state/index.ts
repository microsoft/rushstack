// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export enum ProjectType {
  RUSH_PROJECT,
  PNPM_WORKSPACE
}

export interface IRushProjectDetails {
  projectName: string;
  projectFolder: string;
}

export interface IAppState {
  currDir: string;
  projectRoot: string;
  projectType: ProjectType;
  pnpmLockfileLocation: string;
  pnpmfileLocation: string;
  appVersion: string;
  rush: {
    projects: {
      [key in string]: IRushProjectDetails;
    };
  };
}

interface IProps {
  currDir: string;
}
export class AppState implements IAppState {
  public currDir: string;
  public projectRoot: string = '';
  public projectType: ProjectType = ProjectType.RUSH_PROJECT;
  public pnpmLockfileLocation: string = '';
  public pnpmfileLocation: string = '';
  public appVersion: string = '';
  public rush: {
    projects: {
      [key in string]: IRushProjectDetails;
    };
  } = {
    projects: {}
  };

  public constructor(props: IProps) {
    this.currDir = props.currDir;
  }
}
