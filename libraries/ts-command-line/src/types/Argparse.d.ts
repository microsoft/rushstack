// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as argparse from 'argparse';

export interface IExtendedArgumentParserOptions extends argparse.ArgumentParserOptions {
  // The underlying code supports this property, but the @types/argparse package does not
  // contain the property.
  allow_abbrev?: boolean;
}

export interface IExtendedArgumentGroup extends argparse.ArgumentGroup {
  // The underlying code supports this signature, but the @types/argparse package does not
  // contain the signature. Arrays have been deprecated.
  add_argument(arg: string, options?: argparse.ArgumentOptions): void;
  add_argument(arg1: string, arg2: string, options?: argparse.ArgumentOptions): void;
  add_argument(arg1: string, arg2: string, arg3: string, options?: argparse.ArgumentOptions): void;
}
