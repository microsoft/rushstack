// See npm-check-license for license information.

export interface INpmRegistryInfo {
  latest?: string;
  next?: string;
  versions?: string[];
  homepage?: string;
  error?: string;
}

interface IRegistryInfoBugs {
  url?: string;
}
interface IRepository {
  url?: string;
}
export interface IPackageVersion {
  homepage?: string;
  bugs?: IRegistryInfoBugs;
  repository?: IRepository;
}
export interface IRegistryData {
  versions: Record<string, IPackageVersion>;
  ['dist-tags']: { latest: string };
}
