// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export * from "./IFolder";
import { IFolder } from "./IFolder";

/** @public */
export class IFile {
  containingFolder: IFolder;
}

/** @public */
export class A { }
