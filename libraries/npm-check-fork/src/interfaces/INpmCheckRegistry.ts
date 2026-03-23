/**
 * The result returned by getNpmInfo for a single package.
 */
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

/**
 * Metadata for a specific package version from the npm registry.
 *
 * @remarks
 * This interface extends the existing INpmCheckPackageVersion with additional
 * fields that are present in the npm registry response.
 *
 * @see https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md
 */
export interface INpmRegistryVersionMetadata extends INpmCheckPackageVersion {
  /** Package name */
  name: string;

  /** Version string */
  version: string;
}

/**
 * Response structure from npm registry API for full metadata.
 *
 * @remarks
 * This interface represents the full response from the npm registry when
 * fetching package metadata. It is structurally compatible with INpmCheckRegistryData
 * to maintain compatibility with existing code like bestGuessHomepage.
 *
 * @see https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md
 */
export interface INpmRegistryPackageResponse {
  /** Package name */
  name: string;

  /** Distribution tags (latest, next, etc.) */
  'dist-tags': Record<string, string>;

  /** All published versions with their metadata */
  versions: Record<string, INpmRegistryVersionMetadata>;

  /** Modification timestamps for each version */
  time?: Record<string, string>;
}
