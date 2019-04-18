// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { SourceMapConsumer, RawSourceMap, MappingItem, Position } from 'source-map';
import { IExtractorMessageOptions } from '../api/ExtractorMessage';
import { FileSystem, InternalError, JsonFile, NewlineKind } from '@microsoft/node-core-library';

interface ISourceMap {
  sourceMapConsumer: SourceMapConsumer;

  // SourceMapConsumer.originalPositionFor() is useless because the mapping contains numerous gaps,
  // and the API provides no way to find the nearest match.  So instead we extract all the mapping items
  // and search them using SourceMapper._findNearestMappingItem().
  mappingItems: MappingItem[];
}

interface IOriginalFileInfo {
  // Whether the .ts file exists
  fileExists: boolean;

  // This is used to check whether the guessed position is out of bounds.
  // Since column/line numbers are 1-based, the 0th item in this array is unused.
  maxColumnForLine: number[];
}

export class SourceMapper {
  // Map from .d.ts file path --> ISourceMap if a source map was found, or null if not found
  private _sourceMapByFilePath: Map<string, ISourceMap | null>
    = new Map<string, ISourceMap | null>();

  // Cache the FileSystem.exists() result for mapped .ts files
  private _originalFileInfoByPath: Map<string, IOriginalFileInfo> = new Map<string, IOriginalFileInfo>();

  /**
   * If the `IExtractorMessageOptions` refers to a `.d.ts` file, look for a `.d.ts.map` and
   * if possible update the coordinates to refer to the original `.ts` file.
   */
  public updateExtractorMessageOptions(options: IExtractorMessageOptions): void {
    if (!options.sourceFilePath) {
      return;
    }

    if (!FileSystem.exists(options.sourceFilePath)) {
      // Sanity check
      throw new InternalError('The referenced path was not found: ' + options.sourceFilePath);
    }

    let sourceMap: ISourceMap | null | undefined = this._sourceMapByFilePath.get(options.sourceFilePath);

    if (sourceMap === undefined) {
      // Normalize the path and redo the lookup
      const normalizedPath: string = FileSystem.getRealPath(options.sourceFilePath);

      sourceMap = this._sourceMapByFilePath.get(normalizedPath);
      if (sourceMap !== undefined) {
        // Copy the result from the normalized to the non-normalized key
        this._sourceMapByFilePath.set(options.sourceFilePath, sourceMap);
      } else {
        // Given "folder/file.d.ts", check for a corresponding "folder/file.d.ts.map"
        const sourceMapPath: string = normalizedPath + '.map';
        if (FileSystem.exists(sourceMapPath)) {
          // Load up the source map
          const rawSourceMap: RawSourceMap = JsonFile.load(sourceMapPath) as RawSourceMap;

          const sourceMapConsumer: SourceMapConsumer = new SourceMapConsumer(rawSourceMap);
          const mappingItems: MappingItem[] = [];

          // Extract the list of mapping items
          sourceMapConsumer.eachMapping(
            (mappingItem: MappingItem) => {
              mappingItems.push({
                ...mappingItem,
                // The "source-map" package inexplicably uses 1-based line numbers but 0-based column numbers.
                // Fix that up proactively so we don't have to deal with it later.
                generatedColumn: mappingItem.generatedColumn + 1,
                originalColumn: mappingItem.originalColumn + 1
              });
            },
            this,
            SourceMapConsumer.GENERATED_ORDER
          );

          sourceMap = { sourceMapConsumer, mappingItems};
        } else {
          // No source map for this filename
          sourceMap = null; // tslint:disable-line:no-null-keyword
        }

        this._sourceMapByFilePath.set(normalizedPath, sourceMap);
        if (options.sourceFilePath !== normalizedPath) {
          // Add both keys to the map
          this._sourceMapByFilePath.set(options.sourceFilePath, sourceMap);
        }
      }
    }

    if (sourceMap === null) {
      // No source map for this filename
      return;
    }

    // Make sure sourceFileLine and sourceFileColumn are defined
    if (options.sourceFileLine === undefined) {
      options.sourceFileLine = 1;
    }
    if (options.sourceFileColumn === undefined) {
      options.sourceFileColumn = 1;
    }

    const nearestMappingItem: MappingItem | undefined = SourceMapper._findNearestMappingItem(sourceMap.mappingItems,
      {
        line: options.sourceFileLine,
        column: options.sourceFileColumn
      }
    );

    if (nearestMappingItem === undefined) {
      // No mapping for this location
      return;
    }

    const mappedFilePath: string = path.resolve(path.dirname(options.sourceFilePath), nearestMappingItem.source);

    // Does the mapped filename exist?  Use a cache to remember the answer.
    let originalFileInfo: IOriginalFileInfo | undefined = this._originalFileInfoByPath.get(mappedFilePath);
    if (originalFileInfo === undefined) {
      originalFileInfo = {
        fileExists: FileSystem.exists(mappedFilePath),
        maxColumnForLine: []
      };

      if (originalFileInfo.fileExists) {
        // Read the file and measure the length of each line
        originalFileInfo.maxColumnForLine =
          FileSystem.readFile(mappedFilePath, { convertLineEndings: NewlineKind.Lf })
          .split('\n')
          .map(x => x.length + 1); // +1 since columns are 1-based
        originalFileInfo.maxColumnForLine.unshift(0);  // Extra item since lines are 1-based
      }

      this._originalFileInfoByPath.set(mappedFilePath, originalFileInfo);
    }

    if (!originalFileInfo.fileExists) {
      // Don't translate coordinates to a file that doesn't exist
      return;
    }

    // The nearestMappingItem anchor may be above/left of the real position, due to gaps in the mapping.  Calculate
    // the delta and apply it to the original position.
    const guessedPosition: Position = {
      line: nearestMappingItem.originalLine + options.sourceFileLine - nearestMappingItem.generatedLine,
      column: nearestMappingItem.originalColumn + options.sourceFileColumn - nearestMappingItem.generatedColumn
    };

    // Verify that the result is not out of bounds, in cause our heuristic failed
    if (guessedPosition.line >= 1
      && guessedPosition.line < originalFileInfo.maxColumnForLine.length
      && guessedPosition.column >= 1
      && guessedPosition.column <= originalFileInfo.maxColumnForLine[guessedPosition.line]) {

      options.sourceFilePath = mappedFilePath;
      options.sourceFileLine = guessedPosition.line;
      options.sourceFileColumn = guessedPosition.column;
    } else {
      // The guessed position was out of bounds, so use the nearestMappingItem position instead.
      options.sourceFilePath = mappedFilePath;
      options.sourceFileLine = nearestMappingItem.originalLine;
      options.sourceFileColumn = nearestMappingItem.originalColumn;
    }
  }

  // The `mappingItems` array is sorted by generatedLine/generatedColumn (GENERATED_ORDER).
  // The _findNearestMappingItem() lookup is a simple binary search that returns the previous item
  // if there is no exact match.
  private static _findNearestMappingItem(mappingItems: MappingItem[], position: Position): MappingItem | undefined {
    if (mappingItems.length === 0) {
      return undefined;
    }

    let startIndex: number = 0;
    let endIndex: number = mappingItems.length - 1;

    while (startIndex <= endIndex) {
      const middleIndex: number = startIndex + Math.floor((endIndex - startIndex) / 2);

      const diff: number = SourceMapper._compareMappingItem(mappingItems[middleIndex], position);

      if (diff < 0) {
        startIndex = middleIndex + 1;
      } else if (diff > 0) {
        endIndex = middleIndex - 1;
      } else {
        // Exact match
        return mappingItems[middleIndex];
      }
    }

    // If we didn't find an exact match, then endIndex < startIndex.
    // Take endIndex because it's the smaller value.
    return mappingItems[endIndex];
  }

  private static _compareMappingItem(mappingItem: MappingItem, position: Position): number {
    const diff: number = mappingItem.generatedLine - position.line;
    if (diff !== 0) {
      return diff;
    }
    return mappingItem.generatedColumn - position.column;
  }
}
