// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import SubOptions from './sub/SubOptions.ts';

/** @public */
export default interface Options {
  name: string;
  color: 'red' | 'blue';
  subOptions: SubOptions;
}
