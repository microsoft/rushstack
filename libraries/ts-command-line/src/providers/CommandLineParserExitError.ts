// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

export class CommandLineParserExitError extends Error {
  public readonly exitCode: number;

  public constructor(exitCode: number, message: string) {
    super(message);

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc
    // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = CommandLineParserExitError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any

    this.exitCode = exitCode;
  }
}

export class CustomArgumentParser extends argparse.ArgumentParser {
  public exit(status: number, message: string): void { // override
    throw new CommandLineParserExitError(status, message);
  }

  public error(err: Error | string): void { // override
    // Ensure the ParserExitError bubbles up to the top without any special processing
    if (err instanceof CommandLineParserExitError) {
      throw err;
    }

    super.error(err);
  }
}