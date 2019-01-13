// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
class X {
}

export { X }

// TODO: "Internal Error: The symbol Y was also exported as X; this is not supported yet"
// export { X as Y}
