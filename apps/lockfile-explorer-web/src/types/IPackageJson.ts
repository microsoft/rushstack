// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IPackageJson {
  name: string;
  version: string;
  dependencies: {
    [key in string]: string;
  };
  devDependencies: {
    [key in string]: string;
  };
  peerDependencies: {
    [key in string]: string;
  };
}
