import { LockfileEntry, LockfileEntryFilter } from './parsing/LockfileEntry';

export function linter(entries: LockfileEntry[]): void {
  const projectEntries: LockfileEntry[] = [];
  // Get the list of side-by-side versions
  const groupedPackageEntries: Map<string, LockfileEntry[]> = new Map();
  const sideBySidePackageNames: Set<string> = new Set();
  for (const entry of entries) {
    switch (entry.kind) {
      case LockfileEntryFilter.Package: {
        let groupedEntries: LockfileEntry[] | undefined = groupedPackageEntries.get(entry.entryPackageName);
        if (!groupedEntries) {
          groupedEntries = [];
          groupedPackageEntries.set(entry.entryPackageName, groupedEntries);
        }
        groupedEntries.push(entry);
        if (groupedEntries.length > 1) {
          sideBySidePackageNames.add(entry.entryPackageName);
        }
        break;
      }
      case LockfileEntryFilter.Project: {
        projectEntries.push(entry);
        break;
      }
    }
  }

  // set of package names that we need to log, calculated by going from project root downwards until we encounter a
  // side by side version
  const clusterNodes: Record<
    string,
    {
      duplicateVersions: Set<string>;
      allowedConnected: Record<string, string[][]>;
    }
  > = {};

  // Mapping of projectName -> dep.name -> set of versions that it has
  const connectedProjectsToClusters: Record<string, Record<string, Set<string>>> = {};

  for (const projectEntry of projectEntries) {
    const visited = new Set<LockfileEntry>();
    connectedProjectsToClusters[projectEntry.entryPackageName] = {};

    // Keep track of the lockfile entries we visit when traversing the graph
    const parentStack: string[] = [];

    // This function recursively enters lockfile entries and searches the dependencies for any cluster nodes
    // It also keeps track of the recursion path to compile a folder path from the projectEntry to the side-by-side cluster node detected
    function traverseEntryRecursively(currNode: LockfileEntry) {
      parentStack.push(currNode.entryPackageName);
      if (currNode?.dependencies) {
        // Search dependencies of current node
        for (const dep of currNode?.dependencies) {
          // If we have visited this dependency before (as it parsed it with helper), skip it
          if (!dep.resolvedEntry || visited.has(dep.resolvedEntry)) {
            continue;
          }
          // If this dependency is a known side-by-side version, process it instead of visiting it's dependencies
          if (sideBySidePackageNames.has(dep.name)) {
            // If we are here, it means this dependency is a "clusterNode"
            // which means it is a dependency that has no side-by-side dependency parents, as we skip checking side-by-side
            // dependency's child trees.

            // Record the cluster node version in duplicateVersions
            if (clusterNodes[dep.name]) {
              clusterNodes[dep.name].duplicateVersions.add(dep.version);
            } else {
              clusterNodes[dep.name] = {
                duplicateVersions: new Set([dep.version]),
                allowedConnected: {}
              };
            }

            // If we haven't seen this dependency for this project yet, create a Set to keep track of any future versions
            if (!connectedProjectsToClusters[projectEntry.entryPackageName][dep.name]) {
              connectedProjectsToClusters[projectEntry.entryPackageName][dep.name] = new Set();
            }

            // If the dependency version is the same as we've seen before for this project, ignore it.
            if (connectedProjectsToClusters[projectEntry.entryPackageName][dep.name].has(dep.version)) {
              continue;
            }
            connectedProjectsToClusters[projectEntry.entryPackageName][dep.name].add(dep.version);

            // Add this new connected dependency to the project, alongside the parent path trace
            if (clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName]) {
              clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName].push([
                ...parentStack,
                dep.version
              ]);
            } else {
              clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName] = [
                [...parentStack, dep.version]
              ];
            }
          } else {
            // This current entry isn't a side-by-side dep, so we need to recursively check it's dependencies to look for any others
            visited.add(dep.resolvedEntry);
            traverseEntryRecursively(dep.resolvedEntry);
          }
        }
      }
      parentStack.pop();
    }

    traverseEntryRecursively(projectEntry);
  }

  // For each cluster node, go through the allowedConnected list's projects and look for any projects that:
  // Have the same origin project
  const fullDependencyClustersLint: Record<
    string,
    {
      duplicateVersions: Set<string>;
      allowedConnected: Record<string, string[][]>;
      notConnected: Record<string, string[][]>;
    }
  > = {};

  function getNewFilteredNodes(
    packageName: string,
    val: {
      duplicateVersions: Set<string>;
      allowedConnected: {
        [x: string]: string[][];
      };
    }
  ) {
    // New filtered allowedConnected object
    const newConnected: typeof val.allowedConnected = {};
    const notConnected: typeof val.allowedConnected = {};
    // Look through the current allowedConnected object (which is an object of { [projectName]: parentPath[] }
    for (const [projectName, parentPaths] of Object.entries(val.allowedConnected)) {
      // If there's only one parent path (occurs when there is only one cluster node in this project), skip it
      if (parentPaths.length === 1) {
        continue;
      }
      let currMax = 0;
      for (const parentPath of parentPaths) {
        const rootParent = parentPath[1]; // As parentPath[0] is the current projectName
        if (!connectedProjectsToClusters[rootParent]) {
          // package in parent path isn't a project
          break;
        } else {
          // if it is a project, update currMax
          currMax = Math.max(connectedProjectsToClusters[rootParent][packageName].size, currMax);
        }
      }
      // In this case, currMax can represent two things:
      // If it is 0, it means there are no other projects further down the chain from this project
      // Otherwise, if it is > 0, then that number indicates the max number of clusters the child has
      // If the child of any path has a higher Max than the count for this package, then there is no point in listing this package.
      if (currMax > connectedProjectsToClusters[projectName][packageName].size || currMax === 0) {
        newConnected[projectName] = parentPaths;
      } else {
        notConnected[projectName] = parentPaths;
      }
    }
    fullDependencyClustersLint[packageName] = {
      ...val,
      allowedConnected: newConnected,
      notConnected: notConnected
    };
  }
  for (const [packageName, val] of Object.entries(clusterNodes)) {
    if (val.duplicateVersions.size === 1) continue;
    getNewFilteredNodes(packageName, val);
  }

  console.log('DEBUG MODE');
  console.log(`
In debug mode, additional information is included that may not appear in the final version of the linting report, such as: \n\n
- The set of not connected packages (These are packages that are filtered out because they are only "connected" projects in the sense that one of their dependent projects is a "connected" project
- The path trace from the "connected" project to the side-by-side cluster node, including the version
- The exact versions of the duplicateVersions (final report may only indicate the number of duplicated versions)
  `);
  console.log('Number of clusters: ', Object.keys(fullDependencyClustersLint).length);
  console.log(`
How to read the linting object:

Example key value pair in the below output:

"eslint": {
  "duplicateVersions":{ 1.0.0, 2.0.0, 3.0.0 },
  "allowedConnected":{
    "project1":[["project1","dependency1","1.0.0"], ["project1","dependency2","2.0.0"], ["project1","dependency3","3.0.0"]]
  },
  "notConnected":{
    "project2":[["project2","project1","dependency1","1.0.0"],"project2","project1","dependency2","2.0.0"],"project2","project1","dependency3","3.0.0"]]
  }
}


objectKey: The cluster node dependency name

duplicateVersions: This is a Set of the side-by-side versions of this package that are cluster nodes
allowedConnected: This is an object where the key is the project name and the value is an array of paths from the project to the cluster node dependency instance and it's version

notConnected: This object has the same information as the allowedConnected object, but are a collection of projects that were filtered out from that list. They were filtered because
their dependencies consist entirely of other allowedConnected projects and do not contribute to more connected projects themselves.
  `);
  console.log(fullDependencyClustersLint);
}
