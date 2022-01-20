// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This file is a little program that prints all of the colors to the console
 */

import { Colors } from '../index';

export function createColorGrid(attributeFunction?: (text: string) => string): string[][] {
  const foregroundFunctions: ((text: string) => string)[] = [
    (text) => text,
    Colors.black,
    Colors.white,
    Colors.gray,
    Colors.magenta,
    Colors.red,
    Colors.yellow,
    Colors.green,
    Colors.cyan,
    Colors.blue
  ];

  const backgroundFunctions: ((text: string) => string)[] = [
    (text) => text,
    Colors.blackBackground,
    Colors.whiteBackground,
    Colors.grayBackground,
    Colors.magentaBackground,
    Colors.redBackground,
    Colors.yellowBackground,
    Colors.greenBackground,
    Colors.cyanBackground,
    Colors.blueBackground
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
