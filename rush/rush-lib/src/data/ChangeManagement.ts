/**
 * Representation for a changes file
 */
export interface IChangeFile {
  changes: IChangeInfo[];
  email: string;
}

/**
 * Represents all of the types of change requests.
 */
export enum ChangeType {
  none = 0,
  dependency = 1,
  patch = 2,
  minor = 3,
  major = 4
}

/** Defines an IChangeInfo object. */
export interface IChangeInfo {
  /**
   * Defines the type of change. This is not expected to exist within the JSON file definition as we
   * parse it from the "type" property.
   */
  changeType?: ChangeType;

  /**
   * Defines the array of related changes for the given package. This is used to iterate over comments
   * requested by the change requests.
   */
  changes?: IChangeInfo[];

  /**
   * A user provided comment for the change.
   */
  comment?: string;

  /**
   * The new downstream range dependency, as calculated by the findChangeRequests function.
   */
  newRangeDependency?: string;

  /**
   * The new version for the package, as calculated by the findChangeRequests function.
   */
  newVersion?: string;

  /**
   * The order in which the change request should be published.
   */
  order?: number;

  /**
   * The name of the package.
   */
  packageName: string;

  /**
   * The type of the package publishing request (patch/minor/major), as provided by the JSON file.
   */
  type?: string;
}
