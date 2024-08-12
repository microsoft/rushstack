// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { sep } from 'node:path';

export const normalizeToSlash: (path: string) => string =
  sep === '/' ? (path: string) => path : (path: string) => path.replace(/\\/g, '/');

export const normalizeToPlatform: (path: string) => string =
  sep === '/' ? (path: string) => path : (path: string) => path.replace(/\//g, sep);
