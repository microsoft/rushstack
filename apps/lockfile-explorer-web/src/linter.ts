import { LockfileEntry, LockfileEntryFilter } from './parsing/LockfileEntry';

interface ILockfileEntryGroup {
  entryName: string;
  versions: LockfileEntry[];
}

export const linter = (entries: LockfileEntry[]) => {
  const packageEntries = entries.filter((entry) => entry.kind === LockfileEntryFilter.Package);
  const projectEntries = entries.filter((entry) => entry.kind === LockfileEntryFilter.Project);

  // Get the list of side-by-side versions
  const reducedEntries = packageEntries.reduce((groups: { [key in string]: LockfileEntry[] }, item) => {
    const group = groups[item.entryPackageName] || [];
    group.push(item);
    groups[item.entryPackageName] = group;
    return groups;
  }, {});
  let groupedEntries: ILockfileEntryGroup[] = [];
  for (const [packageName, entries] of Object.entries(reducedEntries)) {
    groupedEntries.push({
      entryName: packageName,
      versions: entries
    });
  }

  const sideBySide = groupedEntries.filter((entry) => entry.versions.length > 1);
  const sideBySidePackageNames = new Set(sideBySide.map((s) => s.entryName));

  // set of package names that we need to log, calculated by going from project root downwards until we encounter a
  // side by side version
  const clusterNodes: {
    [key in string]: {
      duplicateVersions: Set<string>;
      allowedConnected: {
        [key in string]: string[][];
      };
    };
  } = {};

  // Mapping of projectName -> dep.name -> set of versions that it has
  const connectedProjectsToClusters: { [key in string]: { [key in string]: Set<string> } } = {};

  for (const projectEntry of projectEntries) {
    const visited = new Set<LockfileEntry>();
    connectedProjectsToClusters[projectEntry.entryPackageName] = {};

    // This keeps track of any side-by-side dependencies we encounter in this project
    // We save only one version because if we encounter any other versions for the same side-by-side dependency in the same project
    // Then we know that this project contains more than one side-by-side dependency in it's tree
    const seenSideBySide: { [key in string]: string } = {};
    // Keep track of the lockfile entries we visit when traversing the graph
    const parentStack: string[] = [];

    function helper(currNode: LockfileEntry) {
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
            if (clusterNodes[dep.name]) {
              clusterNodes[dep.name].duplicateVersions.add(dep.version);
            } else {
              clusterNodes[dep.name] = {
                duplicateVersions: new Set([dep.version]),
                allowedConnected: {}
              };
            }
            if (
              connectedProjectsToClusters[projectEntry.entryPackageName][dep.name] &&
              !connectedProjectsToClusters[projectEntry.entryPackageName][dep.name].has(dep.version)
            ) {
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
              if (!connectedProjectsToClusters[projectEntry.entryPackageName][dep.name]) {
                connectedProjectsToClusters[projectEntry.entryPackageName][dep.name] = new Set();

                if (connectedProjectsToClusters[projectEntry.entryPackageName][dep.name]) {
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
                }
              }
            }
            connectedProjectsToClusters[projectEntry.entryPackageName][dep.name].add(dep.version);
            // // If we have previously seen this side-by-side dependency and it's version is NOT the same as before
            // if (seenSideBySide[dep.name] && seenSideBySide[dep.name] !== dep.version) {
            //   // There are more than one side by side versions in the same project
            //   // We want to also save the "parentStack", which is the path of parent lockfile entries it took to get to this side-by-side version
            //   // (for debugging)
            //   if (clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName]) {
            //     clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName].push([...parentStack]);
            //   } else {
            //     clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName] = [[...parentStack]];
            //   }
            // } else {
            //   // Otherwise, we want to save this dependency version so we know if we encounter a different one later on
            //   seenSideBySide[dep.name] = dep.version;
            // }
          } else {
            visited.add(dep.resolvedEntry);
            helper(dep.resolvedEntry);
          }
        }
      }
      parentStack.pop();
    }

    helper(projectEntry);
  }

  const filteredNodes: typeof clusterNodes = {};
  for (const [key, val] of Object.entries(clusterNodes)) {
    if (val.duplicateVersions.size === 1) continue;
    filteredNodes[key] = val;
  }

  // For each cluster node, go through the allowedConnected list's projects and look for any projects that:
  // Have the same origin project
  const filteredNodes2: {
    [key in string]: {
      duplicateVersions: Set<string>;
      allowedConnected: {
        [key in string]: string[][];
      };
      notConnected: {
        [key in string]: string[][];
      };
    };
  } = {};
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
    filteredNodes2[packageName] = {
      ...val,
      allowedConnected: newConnected,
      notConnected: notConnected
    };
  }
  for (const [packageName, val] of Object.entries(filteredNodes)) {
    getNewFilteredNodes(packageName, val);
  }
  // console.log('eslint: ', filteredNodes['eslint']);

  // getNewFilteredNodes('eslint', filteredNodes['eslint'])

  console.log('DEBUG MODE');
  console.log(`
In debug mode, additional information is included that may not appear in the final version of the linting report, such as: \n\n
- The set of not connected packages (These are packages that are filtered out because they are only "connected" projects in the sense that one of their dependent projects is a "connected" project
- The path trace from the "connected" project to the side-by-side cluster node, including the version
- The exact versions of the duplicateVersions (final report may only indicate the number of duplicated versions)
  `);
  console.log('Number of clusters: ', Object.keys(filteredNodes).length);
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
  console.log(filteredNodes2);
  // console.log(connectedProjectsToClusters)
  // console.log(connectedProjectsToClusters);
};
