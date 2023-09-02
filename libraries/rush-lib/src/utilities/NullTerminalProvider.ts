import type { ITerminalProvider } from '@rushstack/node-core-library';

/**
 * A terminal provider like /dev/null
 */
export class NullTerminalProvider implements ITerminalProvider {
  public supportsColor: boolean = false;
  public eolCharacter: string = '\n';
  public write(): void {}
}
