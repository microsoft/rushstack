import { ISpecChange } from '../parsing/compareSpec';

export const displaySpecChanges = (specChanges: Map<string, ISpecChange>, dep: string): string => {
  switch (specChanges.get(dep)?.type) {
    case 'add':
      return '[Added by .pnpmfile.cjs]';
    case 'diff':
      return `[Changed from ${specChanges.get(dep)?.from}]`;
    case 'remove':
      return '[Deleted by .pnpmfile.cjs]';
    default:
      return 'No Change';
  }
};
