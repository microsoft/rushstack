import { Path } from '@lifaon/path';
import { LockfileEntry } from './LockfileEntry';

export interface ILockfileNode {
  dependencies?: {
    [key in string]: string;
  };
  devDependencies?: {
    [key in string]: string;
  };
}

export class LockfileDependency {
  public name: string;
  public version: string;
  public entryId: string = '';
  public devDependency: boolean;
  public containingEntry: LockfileEntry;
  public resolvedEntry: LockfileEntry | undefined;

  public constructor(name: string, version: string, devDependency: boolean, containingEntry: LockfileEntry) {
    this.name = name;
    this.version = version;
    this.devDependency = devDependency;
    this.containingEntry = containingEntry;

    if (this.version.startsWith('link:')) {
      const relativePath = this.version.substring('link:'.length);
      const rootRelativePath = new Path('.').relative(
        new Path(containingEntry.packageJsonFolderPath).concat(relativePath)
      );
      if (!rootRelativePath) {
        console.error('No root relative path for dependency!', name);
        return;
      }
      this.entryId = 'package:' + rootRelativePath.toString();
    } else if (this.version.startsWith('/')) {
      this.entryId = this.version;
    } else {
      this.entryId = '/' + this.name + '/' + this.version;
    }
  }

  // node is the yaml entry that we are trying to parse
  public static parseDependencies(
    dependencies: LockfileDependency[],
    lockfileEntry: LockfileEntry,
    node: ILockfileNode
  ) {
    if (node.dependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.dependencies)) {
        dependencies.push(new LockfileDependency(pkgName, pkgVersion, false, lockfileEntry));
      }
    }
    if (node.devDependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.devDependencies)) {
        dependencies.push(new LockfileDependency(pkgName, pkgVersion, true, lockfileEntry));
      }
    }
  }
}
