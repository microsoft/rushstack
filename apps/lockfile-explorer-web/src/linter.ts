import { LockfileEntry, LockfileEntryFilter } from './parsing/LockfileEntry';

interface ILockfileEntryGroup {
  entryName: string;
  versions: LockfileEntry[];
}

export const linter = (entries: LockfileEntry[]) => {
  const packageEntries = entries.filter((entry) => entry.kind === LockfileEntryFilter.Package);
  const projectEntries = entries.filter((entry) => entry.kind === LockfileEntryFilter.Project);

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
      // metadata: {
      //   rootProject: string[],
      //   versions: string[]
      // },
      allowedConnected: {
        [key in string]: string[][];
      };
    };
  } = {};

  for (const projectEntry of projectEntries) {
    const visited = new Set<LockfileEntry>();

    const seenSideBySide: { [key in string]: string } = {};
    const parentStack: string[] = [];
    function helper(currNode: LockfileEntry) {
      parentStack.push(currNode.entryPackageName);
      if (currNode?.dependencies) {
        for (const dep of currNode?.dependencies) {
          if (!dep.resolvedEntry || visited.has(dep.resolvedEntry)) {
            continue;
          }
          if (sideBySidePackageNames.has(dep.name)) {
            if (clusterNodes[dep.name]) {
              clusterNodes[dep.name].duplicateVersions.add(dep.version);
              // clusterNodes[dep.name].metadata.versions.push(dep.version);
              // clusterNodes[dep.name].metadata.rootProject.push(currNode.displayText);
            } else {
              clusterNodes[dep.name] = {
                duplicateVersions: new Set([dep.version]),
                // metadata: {
                //   rootProject: [currNode.displayText],
                //   versions: [dep.version]
                // },
                allowedConnected: {}
              };
            }
            if (seenSideBySide[dep.name] && seenSideBySide[dep.name] !== dep.version) {
              // There are two side by side versions in the same project
              if (clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName]) {
                clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName].push([...parentStack]);
              } else {
                clusterNodes[dep.name].allowedConnected[projectEntry.entryPackageName] = [[...parentStack]];
              }
            } else {
              seenSideBySide[dep.name] = dep.version;
            }
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
  // console.log(projectEntries[10])
  // console.log(clusterNodes);

  const filteredNodes: typeof clusterNodes = {};
  for (const [key, val] of Object.entries(clusterNodes)) {
    if (val.duplicateVersions.size === 1) continue;
    filteredNodes[key] = val;
  }

  console.log(filteredNodes);
  console.log(Object.keys(filteredNodes).length);
};
