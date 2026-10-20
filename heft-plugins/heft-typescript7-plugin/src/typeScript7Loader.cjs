// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep native import() outside the TypeScript compiler's CommonJS transformation.
exports.importAsync = (specifier) => import(specifier);
