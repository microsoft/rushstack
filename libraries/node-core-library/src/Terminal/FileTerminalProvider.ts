import { ITerminalProvider } from './ITerminalProvider';
import { FileSystem } from '../FileSystem';

/**
 * @beta
 */
export class FileTerminalProvider implements ITerminalProvider {
  private _filePath: string;

  public constructor(filePath: string) {
    this._filePath = filePath;
  }

  public write(data: string): void {
    try {
      FileSystem.appendToFile(this._filePath, data);
    } catch (e) {
      // Ignore
    }
  }

  public get width(): number | undefined {
    return Number.MAX_VALUE;
  }

  public get supportsColor(): boolean {
    return false;
  }
}
