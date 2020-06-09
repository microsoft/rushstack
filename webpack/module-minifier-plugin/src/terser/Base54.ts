import * as terser from 'terser';
import { IDENTIFIER_TRAILING_DIGITS } from '../Constants';

//#region Terser monkey-patch to remove character frequency analysis
interface IBase54 {
  (ordinal: number): string;
  consider: (token: string, weight: number) => void;
  reset(): void;
  sort(): void;
}

// @ts-ignore Monkey-patch
const base54: IBase54 = terser.base54;
const coreReset: () => void = base54.reset;
base54.reset = (): void => {
  coreReset();
  for (let i: number = 0, len: number = IDENTIFIER_TRAILING_DIGITS.length; i < len; i++) {
    base54.consider(IDENTIFIER_TRAILING_DIGITS[i], len - i);
  }
  base54.sort();
};
base54.reset();

// @ts-ignore Monkey-patch
terser.AST_Toplevel.prototype.compute_char_frequency = (): void => {
  // eslint-disable-line @typescript-eslint/camelcase
  // TODO: Expose hook for exporting character frequency information for use in config
  base54.reset();
};
//#endregion
