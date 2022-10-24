export interface IPackageJson {
  name: string;
  dependencies: {
    [key in string]: string;
  };
  devDependencies: {
    [key in string]: string;
  };
  peerDependencies: {
    [key in string]: string;
  };
}
