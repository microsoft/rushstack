// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This module is imported for its side effects by start.ts, before the rest of Heft is loaded.
// It enables the V8 compile cache (a no-op if bin/heft already enabled it).

import { tryEnableCompileCache } from './CompileCache';

tryEnableCompileCache();
