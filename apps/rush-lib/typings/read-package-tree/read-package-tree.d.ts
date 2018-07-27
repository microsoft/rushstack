// Type definitions for read-package-tree 5.1.2
// Project: https://github.com/npm/read-package-tree
// Definitions by: pgonzal

declare module 'read-package-tree' {
  namespace readPackageTree {
    interface PackageNode {
      children: PackageNode[];
      error?: Error;
      id: number;
      isLink: boolean;
      package: PackageJson;
      parent?: PackageNode;

      /**
       * The absolute path to the folder containing package.json.
       * If isLink=true, this path contains the symlink, i.e. it is not
       * the actual physical path.
       */
      path: string;

      /**
       * If isLink=true, then this is the absolute path to the the folder
       * containing package.json, after following the symlink.
       * If isLink=false, then this is the same as "path".
       */
      realpath: string;

      /**
       * Only used if isLink=true.  As far as I can tell, this object is pointless
       * because it is identical to the current node except that its isLink=false
       * and its parent=null (although its children are the same as the current node).
       */
      // target?: PackageNode;
    }

    interface PackageJson {
      name: string;
      version: string;

      dependencies?: { [key: string]: string };
      description?: string;
      devDependencies?: { [key: string]: string };
      optionalDependencies?: { [key: string]: string };
      private?: boolean;
      scripts?: { [key: string]: string };

      [key: string]: any;
    }
  }

  function readPackageTree(rootFolderPath: string,
    callback: (error: Error, rootNode: readPackageTree.PackageNode) => void
  ): void;
  function readPackageTree(rootFolderPath: string,
    filter: (node: any, childFolder: string) => boolean,
    callback: (error: Error, rootNode: readPackageTree.PackageNode) => void
  ): void;

  export = readPackageTree;
}
