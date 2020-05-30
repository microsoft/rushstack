import { IModuleMinificationCallback } from './ModuleMinifierPlugin.types';

/**
 * Minifier implementation that does not actually transform the code, for debugging.
 * @public
 */
export class NoopMinifier {
  /**
   * No-op code transform.
   * @param code - The code to process
   * @param callback - The callback to invoke
   */
  public minify(
    code: string,
    callback: IModuleMinificationCallback
  ): void {
    callback({
      error: undefined,
      code,
      extractedComments: []
    });
  }

  public shutdown(): void {
    // Nothing to do
  }
}