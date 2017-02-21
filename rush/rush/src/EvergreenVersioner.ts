import * as _ from 'lodash';
import * as semver from 'semver';

export interface IPackage {
  [dependency: string]: string
};

export class EvergreenVersioner {
  private _evergreenPackages: Map<string, string>;
  private _packageInfo: Map<string, Map<string, IPackage>>;

  constructor(evergreenPackages: Map<string, string>,
              packageInfo: Map<string, Map<string, IPackage>>) {
    this._evergreenPackages = evergreenPackages;
    this._packageInfo = packageInfo;
  }

  public solve(packages: string[]) {
    // @todo ensure all packages are in evergreen list

    let context: Map<string, string> = new Map<string, string>();

    // add all the evergreen versions which we are not changing (these are locked)
    this._evergreenPackages.forEach((version: string, project: string) => {
      if (packages.indexOf(project) === -1) {
        context.set(project, version);
      }
    });

    for (let dependency of packages) {
      if (!(context = this._addDependency(context, dependency))) {
        return undefined;
      }
    }
    return context;
  }

  private _addDependency(context: Map<string, string>, dependency: string): Map<string, string> {
    if (context.has(dependency)) {
      return context;
    } else {
      // Find a version that will work!
      const possibleVersions: string[] = this._sortVersions(this._getKeys(this._packageInfo.get(dependency)));

      for (let version of possibleVersions) {
        const newContext = this._tryAddVersion(context, dependency, version);
        if (newContext) {
          return newContext;
        }
      }
    }
    return undefined;
  }

  private _tryAddVersion(context: Map<string, string>, dependency: string, version: string): Map<string, string> {
    // Create a new context assuming we are using this version
    let newContext = _.cloneDeep(context);
    newContext.set(dependency, version);

    const dependencies = this._packageInfo.get(dependency).get(version);
    // Iterate through each dependency
    for (let dep in dependencies) {
      if (this._isEvergreen(dep)) {
        newContext = this._addDependency(newContext, dep);
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