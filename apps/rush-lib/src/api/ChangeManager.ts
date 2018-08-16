import { RushConfiguration } from './RushConfiguration';
import { RushConfigurationProject } from './RushConfigurationProject';
import { ChangeFile } from './ChangeFile';
import { IChangeFile } from './ChangeManagement';

/**
 * @public
 */
export class ChangeManager {
  public static createEmptyChangeFiles(
    rushConfiguration: RushConfiguration,
    projectName: string,
    emailAddress: string): string | undefined {
    const projectInfo: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(projectName);
    if (projectInfo && projectInfo.shouldPublish) {

      const changefile: IChangeFile = { // tslint:disable-line:no-any
        'changes': [{
          comment: '',
          packageName: projectName,
          type: 'none'
        }],
        'packageName': projectName,
        'email': emailAddress
      };

      return new ChangeFile(changefile, rushConfiguration).writeSync();
    }
    return undefined;
  }
}