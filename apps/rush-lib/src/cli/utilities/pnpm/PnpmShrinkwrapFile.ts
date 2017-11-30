import * as fsx from 'fs-extra';
import * as yaml from 'js-yaml';
import * as os from 'os';

import Utilities from '../../../utilities/Utilities';
import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';

interface IShrinkwrapDependencyJson {
  /** Information about the resolved package */
  resolution: {
    /** The hash of the tarball, to ensure archive integrity */
    integrity: string;
    /** The name of the tarball, if this was from a TGX file */
    tarball?: string;
  };
  /** The list of dependencies and the resolved version */
  dependencies: { [dependency: string]: string };
}

/**
 * This interface represents the raw shrinkwrap.YAML file
 * Example:
 *  {
 *    "dependencies": {
 *      "@rush-temp/project1": "file:./projects/project1.tgz"
 *    },
 *    "packages": {
 *      "file:projects/library1.tgz": {
 *        "dependencies: {
 *          "markdown": "0.5.0"
 *        },
 *        "name": "@rush-temp/library1",
 *        "resolution": {
 *          "tarball": "file:projects/library1.tgz"
 *        },
 *        "version": "0.0.0"
 *      },
 *      "markdown/0.5.0": {
 *        "resolution": {
 *          "integrity": "sha1-KCBbVlqK51kt4gdGPWY33BgnIrI="
 *        }
 *      }
 *    },
 *    "registry": "http://localhost:4873/",
 *    "shrinkwrapVersion": 3,
 *    "specifiers": {
 *      "@rush-temp/project1": "file:./projects/project1.tgz"
 *    }
 *  }
 */
interface IShrinkwrapYaml {
  /** The list of resolved version numbers for direct dependencies */
  dependencies: { [dependency: string]: string };
  /** The description of the solved graph */
  packages: { [dependencyVersion: string]: IShrinkwrapDependencyJson };
  /** URL of the registry which was used */
  registry: string;
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

  /**
   * abstract
   * Gets the version number from the list of top-level dependencies in the "dependencies" section
   * of the shrinkwrap file
   */
  protected getTopLevelDependencyVersion(dependencyName: string): string | undefined {
    return BaseShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
  }

  /**
   * abstract
   * Gets the resolved version number of a a dependency for a specific temp project
   */
  protected getDependencyVersion(dependencyName: string, tempProjectName: string): string | undefined {
    // PNPM doesn't have the same advantage of pnpm, where we can skip generate as long as the
    // shrinkwrap file puts our dependency in either the top of the node_modules folder
    // or underneath the package we are looking at.
    // this is because the PNPM shrinkwrap file describes the exact links that need to be created
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