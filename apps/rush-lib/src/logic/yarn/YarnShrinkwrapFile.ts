import {
  BaseShrinkwrapFile
} from '../base/BaseShrinkwrapFile';

export class YarnShrinkwrapFile extends BaseShrinkwrapFile {
  public static loadFromFile(shrinkwrapJsonFilename: string): YarnShrinkwrapFile | undefined {
    return undefined;
  }

  public getTempProjectNames(): ReadonlyArray<string> {
    throw new Error('todo');
  }

  protected serialize(): string {
    throw new Error('todo');
  }

  protected getTopLevelDependencyVersion(dependencyName: string): string | undefined {
    throw new Error('todo');
  }

  /**
   * @param dependencyName the name of the dependency to get a version for
   * @param tempProjectName the name of the temp project to check for this dependency
   * @param versionRange Not used, just exists to satisfy abstract API contract
   */
  protected tryEnsureDependencyVersion(dependencyName: string,
    tempProjectName: string,
    versionRange: string): string | undefined {

    throw new Error('todo');
  }
}
