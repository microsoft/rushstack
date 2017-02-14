import * as semver from 'semver';

import {
  RushConfiguration,
  RushConfigurationProject,
  IPackageJson
} from '@microsoft/rush-lib';

export class TempModuleGenerator {
  private _config: RushConfiguration;
  private _tempModules: Map<string, IPackageJson>;

  constructor(rushConfiguration: RushConfiguration) {
    this._config = rushConfiguration;
    this._tempModules = this._generate();
  }

  public get tempModules(): Map<string, IPackageJson> {
    return this._tempModules;
  }

  /**
   * Generate a temp_module package.json for this project based on an overall configuration
   */
  public _generate(): Map<string, IPackageJson> {
    const tempModules: Map<string, IPackageJson> = new Map<string, IPackageJson>();

    this._config.projects.forEach((project: RushConfigurationProject) => {

      const tempPackageJson: IPackageJson = {
        name: project.tempProjectName,
        version: '0.0.0',
        private: true,
        dependencies: {}
      };

      // If there are any optional dependencies, copy them over directly
      if (project.packageJson.optionalDependencies) {
        tempPackageJson.optionalDependencies = project.packageJson.optionalDependencies;
      }

      // Collect pairs of (packageName, packageVersion) to be added as temp package dependencies
      const pairs: { packageName: string, packageVersion: string }[] = [];

      // If there are devDependencies, we need to merge them with the regular
      // dependencies.  If the same library appears in both places, then the
      // regular dependency takes precedence over the devDependency.
      // It also takes precedence over a duplicate in optionalDependencies,
      // but NPM will take care of that for us.  (Frankly any kind of duplicate
      // should be an error, but NPM is pretty lax about this)
      if (project.packageJson.devDependencies) {
        for (const packageName of Object.keys(project.packageJson.devDependencies)) {
          pairs.push({ packageName: packageName, packageVersion: project.packageJson.devDependencies[packageName] });
        }
      }

      if (project.packageJson.dependencies) {
        for (const packageName of Object.keys(project.packageJson.dependencies)) {
          pairs.push({ packageName: packageName, packageVersion: project.packageJson.dependencies[packageName] });
        }
      }

      for (const pair of pairs) {
        // Is there a locally built Rush project that could satisfy this dependency?
        // If so, then we will symlink to the project folder rather than to common/node_modules.
        // In this case, we don't want "npm install" to process this package, but we do need
        // to record this decision for "rush link" later, so we add it to a special 'rushDependencies' field.
        const localProject: RushConfigurationProject = this._config.getProjectByName(pair.packageName);
        if (localProject) {

          // Don't locally link if it's listed in the cyclicDependencyProjects
          if (!project.cyclicDependencyProjects.has(pair.packageName)) {

            // Also, don't locally link if the SemVer doesn't match
            const localProjectVersion: string = localProject.packageJson.version;
            if (semver.satisfies(localProjectVersion, pair.packageVersion)) {

              // We will locally link this package
              if (!tempPackageJson.rushDependencies) {
                tempPackageJson.rushDependencies = {};
              }
              tempPackageJson.rushDependencies[pair.packageName] = pair.packageVersion;
              continue;
            }
          }
        }

        // We will NOT locally link this package; add it as a regular dependency.
        tempPackageJson.dependencies[pair.packageName] = pair.packageVersion;
      }

      tempModules.set(project.packageName, tempPackageJson);
    });
    return tempModules;
  }
}