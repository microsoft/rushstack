/**
 * Representation for a changes file
 */
export interface IChangeFile {
  changes: IChangeInfo[];
  email: string;
}

/**
 * Represents a single change to a number of projects
 */
export interface IChangeInfo {
  project: string;
  bumpType: 'major' | 'minor' | 'patch' | 'none';
  comments: string;
}