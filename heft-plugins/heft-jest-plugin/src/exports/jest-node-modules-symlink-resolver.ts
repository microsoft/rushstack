// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import '../JestRealPathPatch';
// Using this syntax because HeftJestResolver uses `export =` syntax.
import resolver = require('../HeftJestResolver');
export = resolver;
