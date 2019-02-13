// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IFile } from "./IFile";

/** @public */
export class IFolder {
  containingFolder: IFolder | undefined;
  files: IFile[];
}
