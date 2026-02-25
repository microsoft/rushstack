// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This file is a little program that prints all of the colors to the console
 */

import { Colorize } from '../index.ts';

export function createColorGrid(attributeFunction?: (text: string) => string): string[][] {
  const foregroundFunctions: ((text: string) => string)[] = [
    (text) => text,
    Colorize.black,
    Colorize.white,
    Colorize.gray,
    Colorize.magenta,
    Colorize.red,
    Colorize.yellow,
    Colorize.green,
    Colorize.cyan,
    Colorize.blue
  ];

  const backgroundFunctions: ((text: string) => string)[] = [
    (text) => text,
    Colorize.blackBackground,
    Colorize.whiteBackground,
    Colorize.grayBackground,
    Colorize.magentaBackground,
    Colorize.redBackground,
    Colorize.yellowBackground,
    Colorize.greenBackground,
    Colorize.cyanBackground,
    Colorize.blueBackground
  ];

  const lines: string[][] = [];

  for (const backgroundFunction of backgroundFunctions) {
    const sequences: string[] = [];

    for (const foregroundFunction of foregroundFunctions) {
      let sequence: string = backgroundFunction(foregroundFunction('X'));
      if (attributeFunction) {
        sequence = attributeFunction(sequence);
      }

      sequences.push(sequence);
    }

    lines.push(sequences);
  }

  return lines;
}
