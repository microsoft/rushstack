import * as fsx from 'fs-extra';
import * as yaml from 'js-yaml';
import * as os from 'os';

import Utilities from '../../../utilities/Utilities';
import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';

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
  shrinkwrapVersion: number | undefined;
  /** The list of specifiers used to resolve direct dependency versions */
  specifiers: { [dependency: string]: string };
}

export class PnpmShrinkwrapFile extends BaseShrinkwrapFile {
  private _shrinkwrapJson: IShrinkwrapYaml;

  public static loadFromFile(shrinkwrapYamlFilename: string): PnpmShrinkwrapFile | undefined {
    try {
      if (!fsx.existsSync(shrinkwrapYamlFilename)) {
        return undefined; // file does not exist
      }

      // We don't use JsonFile/jju here because shrinkwrap.json is a special npm file format
      // and typically very large, so we want to load it the same way that npm does.
      const parsedData: IShrinkwrapYaml = yaml.safeLoad(fsx.readFileSync(shrinkwrapYamlFilename).toString());

      return new PnpmShrinkwrapFile(parsedData);
    } catch (error) {
      throw new Error(`Error reading "${shrinkwrapYamlFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies);
  }

  protected getTopLevelDependencyVersion(dependencyName: string): string | undefined {
    return BaseShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
  }

  protected getDependencyVersion(dependencyName: string, tempProjectName: string): string | undefined {
    // pnpm doesn't have the same advantage of pnpm, where we can skip generate as long as the
    // shrinkwrap file puts our dependency in either the top of the node_modules folder
    // or underneath the package we are looking at.
    // this is because the pnpm shrinkwrap file describes the exact links that need to be created
    // to recreate the graph..
    // because of this, we actually need to check to grab the version that this package is actually
    // linked to

    // Example: "project1"
    const unscopedTempProjectName: string = Utilities.parseScopedPackageName(tempProjectName).name;
    const tempProjectDependencyKey: string = `file:projects/${unscopedTempProjectName}.tgz`;

    const packageDescription: IShrinkwrapDependencyJson | undefined
      = BaseShrinkwrapFile.tryGetValue(this._shrinkwrapJson.packages, tempProjectDependencyKey);

    if (!packageDescription || !packageDescription.dependencies) {
      return undefined;
    }

    return packageDescription.dependencies[dependencyName];
  }

  private constructor(shrinkwrapJson: IShrinkwrapYaml) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    if (!this._shrinkwrapJson.registry) {
      this._shrinkwrapJson.registry = '';
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