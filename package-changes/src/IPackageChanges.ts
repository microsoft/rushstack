export interface IPackageChanges {
  files: { [key: string]: string };
  dependencies: {[key: string]: string };
}
