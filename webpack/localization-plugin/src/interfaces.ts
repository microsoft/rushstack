// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ILocJsonFile {
  [stringName: string]: ILocalizedString;
}

export interface ILocalizedString {
  value: string;
  comment: string;
}
