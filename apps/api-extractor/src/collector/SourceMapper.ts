// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { SourceMapConsumer, RawSourceMap, MappingItem, Position } from 'source-map';
import { IExtractorMessageOptions } from '../api/ExtractorMessage';
import { FileSystem, InternalError, JsonFile } from '@microsoft/node-core-library';

interface ISourceMap {
  sourceMapConsumer: SourceMapConsumer;

  // SourceMapConsumer.originalPositionFor() is useless because the mapping contains numerous gaps,
  // and the API provides no way to find the nearest match.  So instead we extract all the mapping items
  // and search them ourself.
  mappingItems: MappingItem[];
}

export class SourceMapper {
  // Map from IExtractorMessageOptions.sourceFilePath --> ISourceMap if a source map was found,
  // or false if not found
  private _sourceMapByFilePath: Map<string, ISourceMap | false>
    = new Map<string, ISourceMap | false>();

  // Cache the FileSystem.exists() result for mapped file paths
  private _existenceByMappedFilePath: Map<string, boolean> = new Map<string, boolean>();

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

    let sourceMap: ISourceMap | false | undefined = this._sourceMapByFilePath.get(options.sourceFilePath);

    if (sourceMap === undefined) {
      // Normalize the path and redo the lookup
      const normalizedPath: string = FileSystem.getRealPath(options.sourceFilePath);

      sourceMap = this._sourceMapByFilePath.get(normalizedPath);
      if (sourceMap !== undefined) {
        // Copy the result to the new key
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
              mappingItems.push(mappingItem);
            },
            this,
            SourceMapConsumer.GENERATED_ORDER
          );

          sourceMap = {
            sourceMapConsumer,
            mappingItems
          };
        } else {
          sourceMap = false;
        }

        this._sourceMapByFilePath.set(options.sourceFilePath, sourceMap);
        this._sourceMapByFilePath.set(normalizedPath, sourceMap);
      }
    }

    if (sourceMap === false) {
      // No source map
      return;
    }

    const nearestMappingItem: MappingItem | undefined = SourceMapper._findNearestMappingItem(sourceMap.mappingItems,
      {
        line: options.sourceFileLine || 1,
        // The source-map package inexplicably uses 1-based line numbers but 0-based column numbers
        column: (options.sourceFileColumn || 1) - 1
      }
    );

    if (nearestMappingItem === undefined) {
      // The source map provides no mapping for this location
      return;
    }

    const mappedFilePath: string = path.resolve(path.dirname(options.sourceFilePath), nearestMappingItem.source);

    // Does the mapped file exist?
    let mappedFileExists: boolean | undefined = this._existenceByMappedFilePath.get(mappedFilePath);
    if (mappedFileExists === undefined) {
      mappedFileExists = FileSystem.exists(mappedFilePath);
      this._existenceByMappedFilePath.set(mappedFilePath, mappedFileExists);
    }

    if (!mappedFileExists) {
      // Don't translate coordinates to a file that doesn't exist
      return;
    }

    // Success -- update the options
    options.sourceFilePath = mappedFilePath;
    options.sourceFileLine = nearestMappingItem.originalLine;
    options.sourceFileColumn = nearestMappingItem.originalColumn + 1;
  }

  private static _findNearestMappingItem(mappingItems: MappingItem[], position: Position): MappingItem | undefined {
    if (mappingItems.length === 0) {
      return undefined;
    }

    let startIndex: number = 0;
    let endIndex: number = mappingItems.length - 1;

    while (startIndex <= endIndex) {
      const middleIndex: number = startIndex + Math.floor((endIndex - startIndex) / 2);

      const diff: number = SourceMapper._compareMappingItem(mappingItems[middleIndex], position);

      if (diff === 0) {
        return mappingItems[middleIndex];
      }

      if (diff < 0) {
        startIndex = middleIndex + 1;
      } else {
        endIndex = middleIndex - 1;
      }
    }

    // If we didn't find a match, then endIndex < startIndex.
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
