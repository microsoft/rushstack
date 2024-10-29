// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IResolverContext {
  descriptionFileRoot: string;
  descriptionFileHash: string | undefined;
  name: string;
  deps: Map<string, string>;
  isProject: boolean;
  ordinal: number;
  parent?: IResolverContext | undefined;
  optional?: boolean;
  nestedPackageDirs?: string[];
}

export type IDependencyEntry =
  | string
  | {
      version: string;
      specifier: string;
    };
