// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import type { IStringValuesTypingsGeneratorBaseOptions } from '../StringValuesTypingsGenerator';

let inputFs: Record<string, string>;
let outputFs: Record<string, string>;

jest.mock('@rushstack/node-core-library', () => {
  const realNcl: typeof import('@rushstack/node-core-library') = jest.requireActual(
    '@rushstack/node-core-library'
  );
  return {
    ...realNcl,
    FileSystem: {
      readFileAsync: async (filePath: string) => {
        const result: string | undefined = inputFs[filePath];
        if (result === undefined) {
          const error: NodeJS.ErrnoException = new Error(
            `Cannot read file ${filePath}`
          ) as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        } else {
          return result;
        }
      },
      writeFileAsync: async (filePath: string, contents: string) => {
        outputFs[filePath] = contents;
      }
    }
  };
});

// Imported after jest.mock so that the mocking API precedes regular imports.
import { decode, type SourceMapSegment } from '@jridgewell/sourcemap-codec';

interface IDecodedSegment {
  generatedLine: number;
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
}

type IMappedSegment = [number, number, number, number] | [number, number, number, number, number];

/** A segment with only a generated column carries no source position. */
function isMappedSegment(segment: SourceMapSegment): segment is IMappedSegment {
  return segment.length >= 4;
}

/**
 * Flattens the codec's decoded output into one entry per mapped segment, so the assertions can be
 * written in terms of individual declarations.
 */
function decodeMappings(mappings: string): IDecodedSegment[] {
  const decoded: IDecodedSegment[] = [];
  decode(mappings).forEach((lineSegments: SourceMapSegment[], generatedLine: number) => {
    for (const segment of lineSegments) {
      if (!isMappedSegment(segment)) {
        continue;
      }

      decoded.push({
        generatedLine,
        generatedColumn: segment[0],
        sourceLine: segment[2],
        sourceColumn: segment[3]
      });
    }
  });

  return decoded;
}

async function generateAsync(
  baseOptions: IStringValuesTypingsGeneratorBaseOptions & { generateDeclarationMaps?: boolean },
  withSourcePositions: boolean,
  secondaryGeneratedTsFolders?: string[]
): Promise<void> {
  const [{ StringValuesTypingsGenerator }, { Terminal, StringBufferTerminalProvider }] = await Promise.all([
    import('../StringValuesTypingsGenerator'),
    import('@rushstack/terminal')
  ]);
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);

  inputFs['/src/test.ext'] = '';

  const generator = new StringValuesTypingsGenerator({
    srcFolder: '/src',
    generatedTsFolder: '/out',
    secondaryGeneratedTsFolders,
    readFile: () => Promise.resolve(''),
    fileExtensions: ['.ext'],
    parseAndGenerateTypings: () => ({
      typings: [
        {
          exportName: 'first',
          comment: 'first comment',
          sourcePosition: withSourcePositions ? { line: 10, column: 0 } : undefined
        },
        {
          exportName: 'second',
          sourcePosition: withSourcePositions ? { line: 20, column: 0 } : undefined
        }
      ]
    }),
    terminal,
    ...baseOptions
  });

  await generator.generateTypingsAsync(['test.ext']);
  expect(terminalProvider.getAllOutput(true)).toEqual({});
}

describe('StringValuesTypingsGenerator declaration maps', () => {
  beforeEach(() => {
    inputFs = {};
    outputFs = {};
  });

  it('does not emit a map when generateDeclarationMaps is not enabled', async () => {
    await generateAsync({}, true);

    expect(Object.keys(outputFs)).toEqual(['/out/test.ext.d.ts']);
    expect(outputFs['/out/test.ext.d.ts']).not.toContain('sourceMappingURL');
  });

  it('does not emit a map when the parser provides no source positions', async () => {
    await generateAsync({ generateDeclarationMaps: true }, false);

    expect(Object.keys(outputFs)).toEqual(['/out/test.ext.d.ts']);
    expect(outputFs['/out/test.ext.d.ts']).not.toContain('sourceMappingURL');
  });

  it('emits a map and a sourceMappingURL comment when enabled', async () => {
    await generateAsync({ generateDeclarationMaps: true }, true);

    expect(Object.keys(outputFs).sort()).toEqual(['/out/test.ext.d.ts', '/out/test.ext.d.ts.map']);
    expect(outputFs['/out/test.ext.d.ts']).toContain('//# sourceMappingURL=test.ext.d.ts.map');

    const map: { version: number; file: string; sources: string[] } = JSON.parse(
      outputFs['/out/test.ext.d.ts.map']
    );
    expect(map.version).toBe(3);
    expect(map.file).toBe('test.ext.d.ts');
    expect(map.sources).toEqual(['../src/test.ext']);
  });

  it('maps each declaration to its source position, accounting for the generated header', async () => {
    await generateAsync({ generateDeclarationMaps: true }, true);

    const contents: string = outputFs['/out/test.ext.d.ts'];
    const lines: string[] = contents.split(/\r?\n/);
    const firstLine: number = lines.findIndex((line: string) => line.includes('const first'));
    const secondLine: number = lines.findIndex((line: string) => line.includes('const second'));
    expect(firstLine).toBeGreaterThan(0);

    const segments: IDecodedSegment[] = decodeMappings(
      (JSON.parse(outputFs['/out/test.ext.d.ts.map']) as { mappings: string }).mappings
    );

    // The declaration positions must line up with where the names actually landed in the output,
    // including the two-line header the generator prepends.
    expect(segments.find((s: IDecodedSegment) => s.generatedLine === firstLine)?.sourceLine).toBe(10);
    expect(segments.find((s: IDecodedSegment) => s.generatedLine === secondLine)?.sourceLine).toBe(20);
  });

  it('maps the start of the file to the top of the source', async () => {
    await generateAsync({ generateDeclarationMaps: true }, true);

    const segments: IDecodedSegment[] = decodeMappings(
      (JSON.parse(outputFs['/out/test.ext.d.ts.map']) as { mappings: string }).mappings
    );

    const fileStart: IDecodedSegment | undefined = segments.find(
      (s: IDecodedSegment) => s.generatedLine === 0 && s.generatedColumn === 0
    );
    expect(fileStart).toBeDefined();
    expect(fileStart!.sourceLine).toBe(0);
    expect(fileStart!.sourceColumn).toBe(0);
  });

  it('emits a correctly rooted map for each secondary output folder', async () => {
    await generateAsync({ generateDeclarationMaps: true }, true, ['/nested/secondary']);

    expect(Object.keys(outputFs).sort()).toEqual([
      '/nested/secondary/test.ext.d.ts',
      '/nested/secondary/test.ext.d.ts.map',
      '/out/test.ext.d.ts',
      '/out/test.ext.d.ts.map'
    ]);

    // The relative path back to the source differs per output folder.
    const primary: { sources: string[] } = JSON.parse(outputFs['/out/test.ext.d.ts.map']);
    const secondary: { sources: string[] } = JSON.parse(outputFs['/nested/secondary/test.ext.d.ts.map']);
    expect(primary.sources).toEqual(['../src/test.ext']);
    expect(secondary.sources).toEqual(['../../src/test.ext']);
  });

  it('works when typings are wrapped in a default export', async () => {
    await generateAsync({ generateDeclarationMaps: true, exportAsDefault: true }, true);

    const contents: string = outputFs['/out/test.ext.d.ts'];
    const lines: string[] = contents.split(/\r?\n/);
    const firstLine: number = lines.findIndex((line: string) => line.includes("'first'"));

    const segments: IDecodedSegment[] = decodeMappings(
      (JSON.parse(outputFs['/out/test.ext.d.ts.map']) as { mappings: string }).mappings
    );
    expect(segments.find((s: IDecodedSegment) => s.generatedLine === firstLine)?.sourceLine).toBe(10);
  });
});
