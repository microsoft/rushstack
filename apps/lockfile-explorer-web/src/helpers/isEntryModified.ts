import { ISpecChange } from '../parsing/compareSpec';
import { LockfileEntry } from '../parsing/LockfileEntry';

export const isEntryModified = (
  entry: LockfileEntry | undefined,
  specChanges: Map<string, ISpecChange>
): boolean => {
  if (!entry) return false;
  for (const dep of entry.dependencies) {
    if (specChanges.has(dep.name)) {
      return true;
    }
  }
  return false;
};
