// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export * from "./IFile";
import { IFile } from "./IFile";

/** @public */
export class IFolder {
  containingFolder: IFolder | undefined;
  files: IFile[];
}

/** @public */
export class B { }
