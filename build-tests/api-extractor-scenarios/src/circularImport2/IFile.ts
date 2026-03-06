// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export * from './IFolder.ts';
import { IFolder } from './IFolder.ts';

/** @public */
export class IFile {
  containingFolder: IFolder;
}

/** @public */
export class A {}
