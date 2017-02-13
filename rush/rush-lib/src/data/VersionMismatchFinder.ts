import RushConfigurationProject from './RushConfigurationProject';

export class VersionMismatchFinder {
  private _projects: RushConfigurationProject[];
 /* store it like this:
  * {
  *   "@types/node": {
  *     "1.0.0": [ '@ms/rush' ]
  *   }
  * }
  */
  private _mismatches: Map<string, Map<string, string[]>>;

  constructor(projects: RushConfigurationProject[]) {
    this._projects = projects;
    this._mismatches = new Map<string, Map<string, string[]>>();
    this._analyze();
  }

  public get numberOfMismatches(): number {
    return this._mismatches.size;
  }

  public getMismatches(): Array<string> {
    return this._iterableToArray<string>(this._mismatches.keys());
  }

  public getVersionsOfMismatch(mismatch: string): Array<string> {
    return this._mismatches.has(mismatch)
      ? this._iterableToArray<string>(this._mismatches.get(mismatch).keys())
      : undefined;
  }

  public getConsumersOfMismatch(mismatch: string, version: string): Array<string> {
    const mismatchedPackage: Map<string, string[]> = this._mismatches.get(mismatch);
    if (!mismatchedPackage) {
      return undefined;
    }

    const mismatchedVersion: string[] = mismatchedPackage.get(version);
    return mismatchedVersion;
  }

  private _analyze(): void {
    this._projects.forEach((project: RushConfigurationProject) => {
      this._addDependenciesToList(project.packageName, project.packageJson.dependencies);
      this._addDependenciesToList(project.packageName, project.packageJson.devDependencies);
      // tslint:disable:no-any
      this._addDependenciesToList(project.packageName, project.packageJson.peerDependencies);
      this._addDependenciesToList(project.packageName, project.packageJson.optionalDependencies);
      // tslint:enable:no-any
    });

    this._mismatches.forEach((mismatches: Map<string, string[]>, project: string) => {
      if (mismatches.size <= 1) {
        this._mismatches.delete(project);
      }
    });
  }

  private _addDependenciesToList(project: string, depMap: { [dependency: string]: string }): void {
    Object.keys(depMap || {}).forEach((dependency: string) => {
      const version: string = depMap[dependency];
      if (!this._mismatches.has(dependency)) {
        this._mismatches.set(dependency, new Map<string, string[]>());
      }
      if (!this._mismatches.get(dependency).has(version)) {
        this._mismatches.get(dependency).set(version, []);
      }
      this._mismatches.get(dependency).get(version).push(project);
    });
  }

  private _iterableToArray<T>(iterable: Iterator<T>): T[] {
    const b: T[] = [];
    let a: IteratorResult<T>;
    while ((a = iterable.next()) && !a.done) {
      b.push(a.value);
    }
    return b;
  }
}