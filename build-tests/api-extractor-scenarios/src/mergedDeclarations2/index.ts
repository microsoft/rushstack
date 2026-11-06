// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
namespace ExportedInterfaceAndLocalNamespace {
  export interface Item {
    id: string;
  }
}

/** @public */
export interface ExportedInterfaceAndLocalNamespace {
  getItems(): ExportedInterfaceAndLocalNamespace.Item[];
}

/** @public */
interface LocalInterfaceAndExportedNamespace {
  size: number;
}

/** @public */
export namespace LocalInterfaceAndExportedNamespace {
  export function create(): LocalInterfaceAndExportedNamespace {
    return { size: 1 };
  }
}
