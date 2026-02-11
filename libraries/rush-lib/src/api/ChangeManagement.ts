// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Representation for a changes file
 */
export interface IChangeFile {
  changes: IChangeInfo[];
  packageName: string;
  email: string | undefined;
}

/**
 * Represents all of the types of change requests.
 * @beta
 */
export enum ChangeType {
  none = 0,
  dependency = 1,
  hotfix = 2,
  patch = 3,
  minor = 4,
  major = 5
}

export interface IVersionPolicyChangeInfo {
  /**
   * Defines the type of change.
   */
  changeType: ChangeType;

  /**
   * The new version for the version policy, as calculated by the findChangeRequests function.
   */
  newVersion: string;

  /**
   * The name of the version policy.
   */
  versionPolicyName: string;
}

/**
 * Defines an IChangeInfo object.
 */
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
   * An optional dictionary of custom string fields.
   */
  customFields?: Record<string, string>;

  /**
   * The email of the user who provided the comment. Pulled from the Git log.
   */
  author?: string;

  /**
   * The commit hash for the change.
   */
  commit?: string;

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
