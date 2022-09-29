export enum LockfileEntryKind {
  Project,
  Package
}

type Props = {
  rawEntryId: string;
  kind: LockfileEntryKind;
  rootPackageJsonPath: string;
  rawYamlData: any;
};
export class LockfileEntry {
  entryId: string;
  kind: LockfileEntryKind;
  rawEntryId: string;
  packageJsonFolderPath: string;

  dependencies: LockfileDependency[] = [];
  referencers: LockfileDependency[] = [];

  // entryPackageName: string;
  // entryPackageVersion: string;
  // entrySuffix: string;

  constructor(data: Props) {
    const { rawEntryId, kind, rootPackageJsonPath, rawYamlData } = data;
    this.entryId = rawEntryId;
    this.rawEntryId = rawEntryId;
    this.kind = kind;
    this.packageJsonFolderPath = rootPackageJsonPath;

    if (kind === LockfileEntryKind.Project) {
    } else {
    }

    LockfileDependency.parseDependencies(this.dependencies, this, rawYamlData);
  }
}

export type LockfileNode = {
  dependencies?: {
    [key in string]: string;
  };
  devDependencies?: {
    [key in string]: string;
  };
};

export class LockfileDependency {
  name: string;
  version: string;
  devDependency: boolean;
  entryId: string;
  containingEntry: LockfileEntry;
  resolvedEntry?: LockfileEntry;

  constructor(
    name: string,
    version: string,
    devDependency: boolean,
    containingEntry: LockfileEntry,
    entryId: string
  ) {
    this.name = name;
    this.version = version;
    this.devDependency = devDependency;
    this.containingEntry = containingEntry;
    this.entryId = entryId;

    if (this.version.startsWith('link:')) {
      const relativePath = this.version.substring('link:'.length);
      // TODO: fix this
      // const rootRelativePath = fs.relativePath.GetRelativePath(".", Path.Combine(containingEntry.PackageJsonFolderPath, relativePath));
      // this.entryId = "project:./" + rootRelativePath.Replace("\\", "/");
    } else if (this.version.startsWith('/')) {
      this.entryId = this.version;
    } else {
      this.entryId = '/' + this.name + '/' + this.version;
    }
  }

  // node is the yaml entry that we are trying to parse
  static parseDependencies(
    dependencies: LockfileDependency[],
    lockfileEntry: LockfileEntry,
    node: LockfileNode
  ) {
    if (node.dependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.dependencies)) {
        dependencies.push(new LockfileDependency(pkgName, pkgVersion, false, lockfileEntry, pkgName));
      }
    }
    if (node.devDependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.devDependencies)) {
        dependencies.push(new LockfileDependency(pkgName, pkgVersion, true, lockfileEntry, pkgName));
      }
    }
  }
}
