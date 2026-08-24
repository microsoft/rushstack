// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { encode, type SourceMapSegment } from '@jridgewell/sourcemap-codec';

/**
 * A zero-based position within a source file.
 *
 * @public
 */
export interface ISourcePosition {
  line: number;
  column: number;
}

/**
 * Associates a position in a generated `.d.ts` file with the position in the source file that
 * produced it.
 *
 * @public
 */
export interface IDeclarationMapping {
  /**
   * The zero-based line in the generated typings, before the generated file header is prepended.
   */
  generatedLine: number;

  /**
   * The zero-based column in the generated typings.
   */
  generatedColumn: number;

  /**
   * The zero-based position in the source file that produced this declaration.
   */
  sourcePosition: ISourcePosition;
}

const SOURCE_MAP_VERSION: 3 = 3;

interface ISourceMap {
  version: 3;
  file: string;
  sourceRoot: string;
  sources: string[];
  names: string[];
  mappings: string;
}

/**
 * Serializes a declaration source map that points a generated `.d.ts` back at the file that
 * produced it. TypeScript's language service follows these maps when resolving "go to definition",
 * so an editor navigates to the original source rather than the generated typings.
 *
 * @param mappings - The positions to map. Generated lines are relative to the typings content
 *   produced by the parser, before `generatedLineOffset` is applied.
 * @param generatedFileName - The file name of the generated typings, used as the map's `file`.
 * @param sourcePath - The path of the source file, relative to the folder containing the map.
 * @param generatedLineOffset - The number of header lines prepended to the generated typings.
 *
 * @public
 */
export function serializeDeclarationMap(
  mappings: readonly IDeclarationMapping[],
  generatedFileName: string,
  sourcePath: string,
  generatedLineOffset: number
): string {
  // The module's own declaration span starts at the beginning of the generated file, so line 0 is
  // always mapped to the top of the source file. Without this, navigating to the module itself
  // would jump to whichever declaration happens to be emitted first.
  const segmentsByLine: SourceMapSegment[][] = [[[0, 0, 0, 0]]];

  for (const mapping of mappings) {
    const generatedLine: number = mapping.generatedLine + generatedLineOffset;
    while (segmentsByLine.length <= generatedLine) {
      segmentsByLine.push([]);
    }

    // The codec takes absolute positions and performs the relative encoding itself.
    segmentsByLine[generatedLine].push([
      mapping.generatedColumn,
      0,
      mapping.sourcePosition.line,
      mapping.sourcePosition.column
    ]);
  }

  for (const lineSegments of segmentsByLine) {
    lineSegments.sort((x: SourceMapSegment, y: SourceMapSegment) => x[0] - y[0]);
  }

  const sourceMap: ISourceMap = {
    version: SOURCE_MAP_VERSION,
    file: generatedFileName,
    sourceRoot: '',
    sources: [sourcePath],
    names: [],
    mappings: encode(segmentsByLine)
  };

  return JSON.stringify(sourceMap);
}
