import * as _ from 'lodash';
import * as semver from 'semver';
import * as colors from 'colors';

export interface IPackage {
  [dependency: string]: string;
}

export class EvergreenVersioner {
  private _evergreenPackages: Map<string, string>;
  private _packageInfo: Map<string, Map<string, IPackage>>;
  private _writer: (text?: string) => void;
  private _spacing: number;
  private _spacingStr: string;

  constructor(evergreenPackages: Map<string, string>,
    packageInfo: Map<string, Map<string, IPackage>>,
    writer: (text?: string) => void = console.log) {
    this._evergreenPackages = evergreenPackages;
    this._packageInfo = packageInfo;

    this._spacing = 0;
    this._spacingStr = '';
    this._writer = (text?: string) => {
      writer(this._spacingStr + (text || ''));
    };
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

    for (const packageName of packages) {
      if (!(context = this._tryAddPackage(context, packageName))) {
        return undefined;
      }
    }
    return context;
  }

  private _tryAddPackage(context: Map<string, string>, packageName: string, lockedVersion?: string):
    Map<string, string> {
    this._writer(`Adding ${packageName}@${lockedVersion || 'latest'}`);

    if (context.size) {
      this._writer(`  Context: `);
      context.forEach((version: string, dep: string) => {
        this._writer(`    - ${dep}@${version}`);
      });
    } else {
      this._writer(`  (empty context)`);
    }
    this._writer();

    if (context.has(packageName)) {
      const contextPackageVersion: string = context.get(packageName);

      if (lockedVersion) {
        if (contextPackageVersion !== lockedVersion) {
          this._writer(colors.red(
            `${packageName}@${contextPackageVersion} exists. Rejecting "${lockedVersion}"`
          ));
          return undefined;
        }
      }
      this._writer(colors.green(
        `${(lockedVersion ? 'Matched' : 'Found')} "${packageName}@${contextPackageVersion}" in context`
      ));
      return context;
    } else {

      if (!lockedVersion) {
        // Find a version that will work!
        const possibleVersions: string[] = this._sortVersions(this._getKeys(this._packageInfo.get(packageName)));

        for (const version of possibleVersions) {
          this._increment();
          const newContext: Map<string, string> = this._checkDependencies(context, packageName, version);
          if (newContext) {
            this._decrement();
            this._writer(colors.green(`Accepted ${packageName}@latest\n`));
            return newContext;
          }
          this._decrement();
        }
        this._writer(colors.red(`Rejected ${packageName}@latest\n`));
        return undefined;
      } else {
        const newContext: Map<string, string> = this._checkDependencies(context, packageName, lockedVersion);
        return newContext;
      }
    }
  }

  private _checkDependencies(context: Map<string, string>, packageName: string, version: string): Map<string, string> {
    // Create a new context assuming we are using this version
    let newContext: Map<string, string> = _.cloneDeep(context);

    this._writer(colors.yellow(`Checking ${packageName}@${version}`));
    newContext.set(packageName, version);

    const dependencies: IPackage = this._packageInfo.get(packageName).get(version);
    // Iterate through each dependency
    for (const dependency in dependencies) {
      if (dependencies.hasOwnProperty(dependency)) {
        const dependencyVersion: string = dependencies[dependency];
        this._increment();
        this._writer(colors.yellow(`-> ${dependency}@${dependencyVersion}`));
        if (this._isEvergreen(dependency)) {
          // Try adding the dependency to the fake context and see that happens
          newContext = this._tryAddPackage(newContext, dependency, dependencyVersion);
          if (!newContext) {
            this._decrement();
            break;
          }
        }
      }
    }

    if (newContext) {
      this._writer(colors.green(`Accepted ${packageName}@${version}\n`));
      this._decrement();
      return newContext;
    } else {
      this._writer(colors.red(`Rejected ${packageName}@${version}\n`));
      this._decrement();
      return undefined;
    }
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

  private _increment(): void {
    this._spacing = Math.max(this._spacing + 1, 0);
    this._calculateSpacing();
  }

  private _decrement(): void {
    this._spacing = Math.max(this._spacing - 1, 0);
    this._calculateSpacing();
  }

  private _calculateSpacing(): void {
    const a: string[] = [];
    for (let i: number = 0; i < this._spacing; i++) {
      a.push('  ');
    }
    this._spacingStr = a.join('');
  }
}