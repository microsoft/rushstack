import * as fsx from 'fs-extra';
import * as os from 'os';

import {
  JsonFile
} from '@microsoft/node-core-library';

import {
  BaseShrinkwrapFile
} from '../base/BaseShrinkwrapFile';

interface IShrinkwrapDependencyJson {
  version: string;
  from: string;
  resolved: string;
  dependencies: { [dependency: string]: IShrinkwrapDependencyJson };
}

interface IShrinkwrapJson {
  name: string;
  version: string;
  dependencies: { [dependency: string]: IShrinkwrapDependencyJson };
}

export class NpmShrinkwrapFile extends BaseShrinkwrapFile {
  private _shrinkwrapJson: IShrinkwrapJson;

  public static loadFromFile(shrinkwrapJsonFilename: string): NpmShrinkwrapFile | undefined {
    let data: string | undefined = undefined;
    try {
      if (!fsx.existsSync(shrinkwrapJsonFilename)) {
        return undefined; // file does not exist
      }

      // We don't use JsonFile/jju here because shrinkwrap.json is a special NPM file format
      // and typically very large, so we want to load it the same way that NPM does.
      data = fsx.readFileSync(shrinkwrapJsonFilename).toString();
      if (data.charCodeAt(0) === 0xFEFF) {  // strip BOM
        data = data.slice(1);
      }

      return new NpmShrinkwrapFile(JSON.parse(data));
    } catch (error) {
      throw new Error(`Error reading "${shrinkwrapJsonFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies);
  }

  protected serialize(): string {
    return JsonFile.stringify(this._shrinkwrapJson);
  }

  protected getTopLevelDependencyVersion(dependencyName: string): string | undefined {
    return this.tryEnsureDependencyVersion(dependencyName, undefined, undefined);
  }

  /**
   * Returns true if the shrinkwrap file includes a package that would satisfiying the specified
   * package name and SemVer version range.  By default, the dependencies are resolved by looking
   * at the root of the node_modules folder described by the shrinkwrap file.  However, if
   * tempProjectName is specified, then the resolution will start in that subfolder.
   *
   * Consider this example:
   *
   * - node_modules\
   *   - temp-project\
   *     - lib-a@1.2.3
   *     - lib-b@1.0.0
   *   - lib-b@2.0.0
   *
   * In this example, hasCompatibleDependency("lib-b", ">= 1.1.0", "temp-project") would fail
   * because it finds lib-b@1.0.0 which does not satisfy the pattern ">= 1.1.0".
   */
  protected tryEnsureDependencyVersion(dependencyName: string,
    tempProjectName: string | undefined,
    versionRange: string | undefined): string | undefined {

    // First, check under tempProjectName, as this is the first place "rush link" looks.
    let dependencyJson: IShrinkwrapDependencyJson | undefined = undefined;

    if (tempProjectName) {
      const tempDependency: IShrinkwrapDependencyJson | undefined = NpmShrinkwrapFile.tryGetValue(
        this._shrinkwrapJson.dependencies, tempProjectName);
      if (tempDependency && tempDependency.dependencies) {
        dependencyJson = NpmShrinkwrapFile.tryGetValue(tempDependency.dependencies, dependencyName);
      }
    }

    // Otherwise look at the root of the shrinkwrap file
    if (!dependencyJson) {
      dependencyJson = NpmShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
    }

    if (!dependencyJson) {
      return undefined;
    }

    return dependencyJson.version;
  }

  private constructor(shrinkwrapJson: IShrinkwrapJson) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    if (!this._shrinkwrapJson.version) {
      this._shrinkwrapJson.version = '';
    }
    if (!this._shrinkwrapJson.name) {
      this._shrinkwrapJson.name = '';
    }
    if (!this._shrinkwrapJson.dependencies) {
      this._shrinkwrapJson.dependencies = { };
    }
  }
}