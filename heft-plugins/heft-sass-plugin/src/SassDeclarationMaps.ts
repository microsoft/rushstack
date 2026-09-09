// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin as PostcssPlugin, Rule } from 'postcss';
import { decode, type SourceMapSegment } from '@jridgewell/sourcemap-codec';

import { originalPositionFor, type ISourcePosition } from '@rushstack/typings-generator';

/**
 * The location of a class declaration in the original stylesheet. The class may be declared in an
 * imported partial rather than the entry file, so the file is tracked alongside the position.
 *
 * @public
 */
export interface IResolvedClassPosition extends ISourcePosition {
  /** Absolute path of the stylesheet that declares the class. */
  absoluteSourcePath: string;
}

/**
 * The subset of a raw source map consumed when resolving positions.
 *
 * @public
 */
export interface IRawSourceMap {
  sources: string[];
  mappings: string;
  sourceRoot?: string;
}

/**
 * Records where each class selector first appears in the CSS being processed.
 *
 * @public
 */
export interface IClassPositionRecorder {
  /** Must be registered before `postcss-modules`, which rewrites class names. */
  plugin: PostcssPlugin;
  positions: Map<string, ISourcePosition>;
}

/**
 * Matches each class in a selector, capturing its name.
 *
 * Every class is captured, including each one in a compound selector such as `.primary.secondary`
 * and a class qualified by an element such as `div.only`, because CSS Modules exports all of them
 * and each therefore needs a mapping. The negative lookbehind skips an escaped dot so that a
 * literal `.` inside a name is not treated as the start of another class.
 */
const CLASS_SELECTOR_REGEXP: RegExp = /(?<!\\)\.([A-Za-z_-][A-Za-z0-9_-]*)/g;

/**
 * Creates a PostCSS plugin that records the position of each class selector in the CSS being
 * processed.
 *
 * Positions are recorded in compiled-CSS order, so the top-level rule for a class is kept rather
 * than a later restatement inside a media query or theme block.
 *
 * @public
 */
export function createClassPositionRecorder(): IClassPositionRecorder {
  const positions: Map<string, ISourcePosition> = new Map();

  const plugin: PostcssPlugin = {
    postcssPlugin: 'rushstack-record-class-positions',
    Rule(rule: Rule): void {
      const start: { line: number; column: number } | undefined = rule.source?.start;
      if (!start) {
        return;
      }

      // PostCSS positions are one-based.
      const position: ISourcePosition = { line: start.line - 1, column: start.column - 1 };

      for (const selector of rule.selectors) {
        CLASS_SELECTOR_REGEXP.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = CLASS_SELECTOR_REGEXP.exec(selector)) !== null) {
          if (!positions.has(match[1])) {
            positions.set(match[1], position);
          }
        }
      }
    }
  };

  return { plugin, positions };
}

/**
 * Converts a `sources` entry from a Sass source map into an absolute file path. Sass emits `file:`
 * URLs by default, but a compilation driven through a custom importer may use another scheme, in
 * which case the caller supplies its own resolver.
 *
 * @public
 */
export function resolveSourceUrl(source: string, baseFolder: string): string {
  if (source.startsWith('file:')) {
    return fileURLToPath(source);
  }

  return path.resolve(baseFolder, source);
}

/**
 * Translates recorded compiled-CSS positions back to the original stylesheets, using the source map
 * that Sass produced for the compilation.
 *
 * Classes whose position cannot be mapped are omitted, leaving navigation for those names
 * unchanged.
 *
 * `resolveSourcePath` converts a `sources` entry from the Sass source map into an absolute file
 * path; it defaults to {@link resolveSourceUrl}.
 *
 * @public
 */
export function resolveStylesheetPositions(
  cssPositions: ReadonlyMap<string, ISourcePosition>,
  sassSourceMap: IRawSourceMap,
  baseFolder: string,
  resolveSourcePath: (source: string, baseFolder: string) => string = resolveSourceUrl
): Map<string, IResolvedClassPosition> {
  const resolved: Map<string, IResolvedClassPosition> = new Map();
  const decoded: SourceMapSegment[][] = decode(sassSourceMap.mappings);
  const sourceRoot: string = sassSourceMap.sourceRoot ? sassSourceMap.sourceRoot.replace(/\/?$/, '/') : '';

  const absoluteSources: (string | undefined)[] = sassSourceMap.sources.map((source: string) => {
    try {
      return resolveSourcePath(`${sourceRoot}${source}`, baseFolder);
    } catch {
      // An unrecognized source is skipped rather than failing the build.
      return undefined;
    }
  });

  for (const [className, cssPosition] of cssPositions) {
    const original: { sourceIndex: number; line: number; column: number } | undefined = originalPositionFor(
      decoded,
      cssPosition.line,
      cssPosition.column
    );
    if (!original) {
      continue;
    }

    const absoluteSourcePath: string | undefined = absoluteSources[original.sourceIndex];
    if (!absoluteSourcePath) {
      continue;
    }

    resolved.set(className, {
      absoluteSourcePath,
      line: original.line,
      column: original.column
    });
  }

  return resolved;
}
