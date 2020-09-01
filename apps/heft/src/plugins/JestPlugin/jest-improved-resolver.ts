// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@jest/types/build/Config';

// This signature is declared here:
// https://github.com/facebook/jest/blob/6f7db3e40f88678f4986c969c6a76c575b51a138/packages/jest-resolve/src/defaultResolver.ts#L14
interface IResolverOptions {
  allowPnp?: boolean;
  basedir: Path;
  browser?: boolean;
  defaultResolver: (path: Path, options: IResolverOptions) => Path;
  extensions?: string[];
  moduleDirectory?: string[];
  paths?: Path[];
  rootDir?: Path;
  packageFilter?: unknown;
}

// Match Jest's magic convention for specifying a mock:
//
// YES:  ../__mocks__/Thing
// YES:  ./__mocks__/Thing.js
//
// Do not match other objects deeper in the tree
// NO:   ./__mocks__/folder/Thing.js
//
// Do not match paths belong to an external package:
// NO:   some-package/__mocks__/Thing
const mockPathRegExp: RegExp = /^(\..*[\/])__mocks__\/([^\/]+)$/;

function resolve(request: string, options: IResolverOptions): string {
  let newRequest: string = request;

  // Jest's manual mock feature works by looking for a matching filename in a  "__mocks__" subfolder,
  // like this:
  //
  //   file                            exports
  //   ------------------------------  ------------------------
  //   path/to/MyClass.ts              MyClass
  //   path/to/__mocks__/MyClass.ts    MyClass, mockedMember
  //
  // At runtime, the Jest will substitute "__mocks__/MyClass.ts" for the real "MyClass.ts".  Often the mock
  // needs to export additional test helpers like mockedMember.  Because Jest was not designed for type safety,
  // the Jest documentation shows examples like this:
  //
  //    jest.mock("./path/to/MyClass");
  //    import { MyClass, mockedMember } from "./path/to/MyClass";
  //
  // But that won't work with TypeScript, because "mockedMember" is not declared by the real MyClass.ts.
  // For proper type safety, we need write it like this:
  //
  //    jest.mock("./path/to/MyClass");
  //    import { MyClass } from "./path/to/MyClass";
  //    import { mockedMember } from "./path/to/__mocks__/MyClass";
  //
  // ...or equivalently:
  //
  //    jest.mock("./path/to/MyClass");
  //    import { MyClass, mockedMember } from "./path/to/__mocks__/MyClass";
  //
  // Unfortunately when Jest substitutes path/to/__mocks__/MyClass.ts for path/to/MyClass.ts, it doesn't tell
  // the module resolver about this, so "./path/to/__mocks__/MyClass" produces a duplicate object and the test fails.
  // The code below fixes that problem, ensuring that the two import paths resolve to the same module object.
  //
  // Documentation:
  // https://jestjs.io/docs/en/manual-mocks
  // https://jestjs.io/docs/en/es6-class-mocks#manual-mock
  const match: RegExpExecArray | null = mockPathRegExp.exec(request);
  if (match) {
    // Example:
    // request    = "../__mocks__/Thing"
    // match[1]   = "../"
    // match[2]   = "Thing"
    // newRequest = "../Thing"
    newRequest = match[1] + match[2];
  }

  return options.defaultResolver(newRequest, options);
}

export = resolve;
