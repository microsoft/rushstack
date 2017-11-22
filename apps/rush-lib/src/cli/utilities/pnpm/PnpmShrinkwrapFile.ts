import * as fsx from 'fs-extra';
import * as yaml from 'js-yaml';
import * as os from 'os';

import ShrinkwrapFile from '../ShrinkwrapFile';

interface IShrinkwrapDependencyJson {
  resolution: {
    integrity: string;
    tarball?: string;
  };
  dependencies: { [dependency: string]: string };
}

/**
 * This interface represents the raw shrinkwrap.YAML file
 */
interface IShrinkwrapYaml {
  /** The list of resolved direct dependencies */
  dependencies: { [dependency: string]: string };
/** The description of the solved DAG */
  packages: { [dependencyVersion: string]: IShrinkwrapDependencyJson };
  /** URL of the registry */
  registry: string;
  shrinkwrapVersion: number;
  /** The list of specifiers used to resolve direct dependency versions */
  specifiers: { [dependency: string]: string };
}

export default class PnpmShrinkwrapFile extends ShrinkwrapFile {
  private _shrinkwrapJson: IShrinkwrapYaml;

  public static loadFromFile(shrinkwrapYamlFilename: string): ShrinkwrapFile | undefined {
    try {
      if (!fsx.existsSync(shrinkwrapYamlFilename)) {
        return undefined; // file does not exist
      }

      // We don't use JsonFile/jju here because shrinkwrap.json is a special NPM file format
      // and typically very large, so we want to load it the same way that NPM does.
      const parsedData: IShrinkwrapYaml = yaml.safeLoad(fsx.readFileSync(shrinkwrapYamlFilename).toString());

      return new PnpmShrinkwrapFile(parsedData);
    } catch (error) {
      throw new Error(`Error reading "${shrinkwrapYamlFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies);
  }

  // @todo this still has problems!
  protected getDependencyVersion(dependencyName: string): string | undefined {
    let dependencyVersion: string | undefined = undefined;

    if (!dependencyVersion) {
      dependencyVersion = ShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
    }

    if (!dependencyVersion) {
      return undefined;
    }

    // dependency version can also be a pnpm path such as "/gulp-karma/0.0.5/karma@0.13.22"
    // in this case we want the first version number that appears. it will be in 3rd spot
    if (dependencyVersion[0] === '/') {
      dependencyVersion = dependencyVersion.split('/')[2];
    }

    return dependencyVersion;
  }

  private constructor(shrinkwrapJson: IShrinkwrapYaml) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    if (!this._shrinkwrapJson.registry) {
      this._shrinkwrapJson.registry = '';
    }
    if (!this._shrinkwrapJson.shrinkwrapVersion) {
      this._shrinkwrapJson.shrinkwrapVersion = 3; // 3 is the current version for pnpm
    }
    if (!this._shrinkwrapJson.dependencies) {
      this._shrinkwrapJson.dependencies = { };
    }
    if (!this._shrinkwrapJson.specifiers) {
      this._shrinkwrapJson.specifiers = { };
    }
    if (!this._shrinkwrapJson.packages) {
      this._shrinkwrapJson.packages = { };
    }
  }
}