import { minify, MinifyOptions, MinifyOutput } from 'terser';
import './DisableCharacterFrequencyAnalysis';

import { IModuleMinificationResult, IModuleMinificationErrorResult } from '../ModuleMinifierPlugin.types';

interface IComment {
  value: string;
  type: 'comment1' | 'comment2' | 'comment3' | 'comment4';
  pos: number;
  line: number;
  col: number;
}

// Borrowed from TerserWebpackPlugin. Identifies a license comment
function extractCondition(astNode: unknown, comment: IComment): boolean {
  return (comment.type === 'comment2' || comment.type === 'comment1') &&
    /@preserve|@lic|@cc_on|^\**!/i.test(comment.value);
};

/**
 * Minifies a single chunk of code. Factored out for reuse between ThreadPoolMinifier and SynchronousMinifier
 * Mutates terserOptions.output.comments to support comment extraction
 * @internal
 */
export function minifySingleFile(source: string, terserOptions: MinifyOptions): IModuleMinificationResult {
  const extractedComments: string[] = [];
  if (!terserOptions.output) {
    terserOptions.output = {};
  }

  terserOptions.output.comments = (astNode: unknown, comment: IComment) => {
    if (extractCondition(astNode, comment)) {
      const commentText: string = comment.type === 'comment2' ? `/*${comment.value}*/\n` : `//${comment.value}\n`;
      extractedComments.push(commentText);
    }

    return false;
  };

  // TODO: Handle source maps
  const minified: MinifyOutput = minify({
    source
  }, terserOptions);

  if (minified.error) {
    return {
      error: minified.error,
      code: undefined,
      extractedComments: undefined
    } as IModuleMinificationErrorResult;
  }

  return {
    error: undefined,
    code: minified.code!,
    extractedComments
  };
}
