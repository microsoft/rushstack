import axios from 'axios';
import { LockfileDependency, LockfileEntry, LockfileEntryKind } from './LockfileNode';

type LockfilePackageType = {
  lockfileVersion: number;
  importers?: {
    [key in string]: {
      specifiers: {
        [key in string]: string;
      };
      dependencies: {
        [key in string]: string;
      };
      devDependencies: {
        [key in string]: string;
      };
    };
  };
  packages?: {
    [key in string]: {
      resolution: {
        integrity: string;
      };
      dependencies: {
        [key in string]: string;
      };
      peerDependencies: {
        [key in string]: string;
      };
      dev: boolean;
    };
  };
};

export const readLockfile = async (lockfilePath: string) => {
  const lockfile: LockfilePackageType = (await axios.get('http://localhost:8091')).data;
  console.log(lockfile);

  const allEntries: LockfileEntry[] = [];
  const allEntriesById: { [key in string]: LockfileEntry } = {};

  const allImporters = [];
  if (lockfile.importers) {
    for (const [importerKey, importerValue] of Object.entries(lockfile.importers)) {
      const importer = new LockfileEntry({
        rawEntryId: importerKey,
        kind: LockfileEntryKind.Project,
        rootPackageJsonPath: lockfilePath,
        rawYamlData: importerValue
      });
      allImporters.push(importer);
      allEntries.push(importer);
      allEntriesById[importerKey] = importer;
    }
  }

  const allPackages = [];
  if (lockfile.packages) {
    for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages)) {
      const currEntry = new LockfileEntry({
        rawEntryId: dependencyKey,
        kind: LockfileEntryKind.Package,
        rootPackageJsonPath: lockfilePath,
        rawYamlData: dependencyValue
      });
      if (dependencyValue.dependencies) {
        for (const [dependencyName, version] of Object.entries(dependencyValue.dependencies)) {
          currEntry.dependencies.push(
            new LockfileDependency(dependencyName, version, dependencyValue.dev, currEntry, dependencyName)
          );
        }
      }

      allPackages.push(currEntry);
      allEntries.push(currEntry);
      allEntriesById[dependencyKey] = currEntry;
    }
  }

  // Construct the graph
  for (const entry of allEntries) {
    for (const dependency of entry.dependencies) {
      const matchedEntry = allEntriesById[dependency.entryId];
      if (matchedEntry) {
        // Create a two way link between the dependency and the entry

        dependency.resolvedEntry = matchedEntry;
        matchedEntry.referencers.push(dependency);
      } else {
        console.error('Could not resolved dependency entryId: ', dependency.entryId);
      }
    }
  }

  console.log('all entries: ', allEntries[0]);
};
