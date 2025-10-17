export interface INpmRegistryInfo {
  latest?: string;
  next?: string;
  versions?: string[];
  homepage?: string;
  error?: string;
}

interface INpmCheckRegistryInfoBugs {
  url?: string;
}
interface INpmCheckRepository {
  url?: string;
}
export interface INpmCheckPackageVersion {
  homepage?: string;
  bugs?: INpmCheckRegistryInfoBugs;
  repository?: INpmCheckRepository;
}
export interface INpmCheckRegistryData {
  versions: Record<string, INpmCheckPackageVersion>;
  ['dist-tags']: { latest: string };
}
