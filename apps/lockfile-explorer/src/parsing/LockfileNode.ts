import { Path } from '@lifaon/path';

const ROOT_PACKAGE_PATH: string = 'common/temp/package.json';

export enum LockfileEntryKind {
  Project,
  Package
}

interface IProps {
  // entryId: string;
  rawEntryId: string;
  kind: LockfileEntryKind;
  rawYamlData: ILockfileNode;
}
export class LockfileEntry {
  public entryId: string = '';
  public kind: LockfileEntryKind;
  public rawEntryId: string;
  public packageJsonFolderPath: string = '';

  public entryPackageName: string = '';
  public displayText: string = '';

  public dependencies: LockfileDependency[] = [];
  public referencers: LockfileDependency[] = [];

  private static _packageEntryIdRegex: RegExp = new RegExp('/(.*)/([^/]+)$');

  public entryPackageVersion: string = '';
  public entrySuffix: string = '';

  public constructor(data: IProps) {
    const { rawEntryId, kind, rawYamlData } = data;
    this.rawEntryId = rawEntryId;
    this.kind = kind;

    if (rawEntryId === '.') {
      // Project Root
      return;
    }

    if (kind === LockfileEntryKind.Project) {
      const rootPackageJsonFolderPath = new Path(ROOT_PACKAGE_PATH).dirname() || '';
      const packageJsonFolderPath = new Path('.').relative(
        new Path(rootPackageJsonFolderPath).concat(rawEntryId)
      );
      const packageName = new Path(rawEntryId).basename();

      if (!packageJsonFolderPath || !packageName) {
        console.error('Could not construct path for entry: ', rawEntryId);
        return;
      }

      this.packageJsonFolderPath = packageJsonFolderPath.toString();
      this.entryId = 'project:' + this.packageJsonFolderPath;
      this.entryPackageName = packageName.toString();
      this.displayText = 'Project: ' + this.entryPackageName;
    } else {
      this.displayText = rawEntryId;

      const match = LockfileEntry._packageEntryIdRegex.exec(rawEntryId);

      if (match) {
        const [, packageName, versionPart] = match;
        this.entryPackageName = packageName;

        const underscoreIndex = versionPart.indexOf('_');
        if (underscoreIndex >= 0) {
          const version = versionPart.substring(0, underscoreIndex);
          const suffix = versionPart.substring(underscoreIndex + 1);

          this.entryPackageVersion = version;
          this.entrySuffix = suffix;

          //       /@rushstack/eslint-config/3.0.1_eslint@8.21.0+typescript@4.7.4
          // -->   @rushstack/eslint-config 3.0.1 (eslint@8.21.0+typescript@4.7.4)
          this.displayText = packageName + ' ' + version + ' (' + suffix + ')';
        } else {
          this.entryPackageVersion = versionPart;

          //       /@rushstack/eslint-config/3.0.1
          // -->   @rushstack/eslint-config 3.0.1
          this.displayText = packageName + ' ' + versionPart;
        }
      }

      // Example:
      //   common/temp/node_modules/.pnpm
      //     /@babel+register@7.17.7_@babel+core@7.17.12
      //     /node_modules/@babel/register
      this.packageJsonFolderPath =
        'common/temp/node_modules/.pnpm/' +
        this.entryPackageName.replace('/', '+') +
        '@' +
        this.entryPackageVersion +
        '/node_modules/' +
        this.entryPackageName;
    }

    LockfileDependency.parseDependencies(this.dependencies, this, rawYamlData);
  }
}

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
