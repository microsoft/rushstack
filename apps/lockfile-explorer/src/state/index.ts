export enum ProjectType {
  RUSH_PROJECT,
  PNPM_WORKSPACE
}

export interface IRushProjectDetails {
  projectFolder: string;
}

export interface IAppState {
  currDir: string;
  projectRoot: string;
  projectType: ProjectType;
  pnpmLockfileLocation: string;
  rush: {
    projects: {
      [key in string]: IRushProjectDetails;
    };
  };
}

interface Props {
  currDir: string;
}
export class AppState implements IAppState {
  currDir: string;
  projectRoot: string = '';
  projectType: ProjectType = ProjectType.RUSH_PROJECT;
  pnpmLockfileLocation: string = '';
  pnpmfileLocation: string = '';
  rush = {
    projects: {}
  };

  constructor(props: Props) {
    this.currDir = props.currDir;
  }
}
