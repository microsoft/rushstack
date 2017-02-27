import * as _ from 'lodash';
import * as semver from 'semver';

export interface IPackage {
  [dependency: string]: string;
}

export class EvergreenVersioner {
  private _evergreenPackages: Map<string, string>;
  private _packageInfo: Map<string, Map<string, IPackage>>;

  constructor(evergreenPackages: Map<string, string>,
              packageInfo: Map<string, Map<string, IPackage>>) {
    this._evergreenPackages = evergreenPackages;
    this._packageInfo = packageInfo;
  }

  public solve(packages: string[]): Map<string, string> {
    // @todo ensure all packages are in evergreen list

    let context: Map<string, string> = new Map<string, string>();

    // add all the evergreen versions which we are not changing (these are locked)
    this._evergreenPackages.forEach((version: string, project: string) => {
      if (packages.indexOf(project) === -1) {
        context.set(project, version);
      }
    });

    for (const dependency of packages) {
      if (!(context = this._addDependency(context, dependency))) {
        return undefined;
      }
    }
    return context;
  }

  private _addDependency(context: Map<string, string>, dependency: string): Map<string, string> {
    console.log(`Adding dependency: "${dependency}"`);
    console.log(`Context: `);
    context.forEach((version: string, dep: string) => {
      console.log(`   - ${dep}@${version}`);
    });

    if (context.has(dependency)) {
      console.log(`Found "${dependency}" in context w/ version "${context.get(dependency)}"`);
      return context;
    } else {
      // Find a version that will work!
      const possibleVersions: string[] = this._sortVersions(this._getKeys(this._packageInfo.get(dependency)));

      for (const version of possibleVersions) {
        console.log(`Trying version: ${version}`);
        const newContext: Map<string, string> = this._tryAddVersion(context, dependency, version);
        if (newContext) {
          console.log(`Accepted ${dependency}@${version}`);
          return newContext;
        } else {
          console.log(`Rejected ${dependency}@${version}`);
        }
      }
    }
    return undefined;
  }

  private _tryAddVersion(context: Map<string, string>, dependency: string, version: string): Map<string, string> {
    // Create a new context assuming we are using this version
    let newContext = _.cloneDeep(context);
    newContext.set(dependency, version);

    const dependencies: IPackage = this._packageInfo.get(dependency).get(version);
    // Iterate through each dependency
    for (const dep in dependencies) {
      if (this._isEvergreen(dep)) {
        // if the dependency has a bad version then fail
        if (newContext.has(dep)) {
          if (newContext.get(dep) === dependencies[dep]) {
            return newContext;
          } else {
            return undefined;
          }
        } else {
          if (!(newContext = this._addDependency(newContext, dep))) {
            return undefined;
          }
        }
      }
    }
    return newContext;
  }

  private _sortVersions(versions: string[]): string[] {
    return versions.sort(semver.rcompare);
  }

  private _isEvergreen(project: string): boolean {
    return this._evergreenPackages.has(project);
  }

  private _getKeys<T, K>(obj: Map<T, K>): T[] {
    const newArray: T[] = [];
    obj.forEach((value: K, key: T) => {
      newArray.push(key);
    });
    return newArray;
  }
}