/**
 * Describes a source folder from which assets should be copied.
 *
 * @public
 */
declare interface IRequireFolderSource {
  /**
   * The root under which glob patterns should be evaluated
   */
  globsBase: string;

  /**
   * Glob patterns matching assets to be copied
   */
  globPatterns: string[];
}

/**
 * @public
 */
declare interface IRequireFolderOptions {
  /**
   * A set of sources to copy to the specified output folder name.
   */
  sources: IRequireFolderSource[];

  /**
   * The name of the folder to which assets should be copied. May contain a "[hash]" token.
   */
  outputFolder: string;
}

declare function requireFolder(options: IRequireFolderOptions): string;
