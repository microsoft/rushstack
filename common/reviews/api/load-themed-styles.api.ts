// @public
enum ClearStyleOptions {
  // (undocumented)
  all = 3,
  // (undocumented)
  onlyNonThemable = 2,
  // (undocumented)
  onlyThemable = 1
}

// @public
export function clearStyles(option: ClearStyleOptions = ClearStyleOptions.all): void;

// @public
export function configureLoadStyles(loadStylesFn: ((processedStyles: string, rawStyles?: string | ThemableArray) => void) | undefined): void;

// @public
export function configureRunMode(mode: Mode): void;

// @public
export function detokenize(styles: string | undefined): string | undefined;

// @public
export function flush(): void;

// @public (undocumented)
interface ITheme {
  // (undocumented)
  [ key: string ]: string;
}

// @public (undocumented)
interface IThemingInstruction {
  // (undocumented)
  defaultValue?: string;
  // (undocumented)
  rawString?: string;
  // (undocumented)
  theme?: string;
}

// @public
export function loadStyles(styles: string | ThemableArray, loadAsync: boolean = false): void;

// @public
export function loadTheme(theme: ITheme | undefined): void;

// @public
enum Mode {
  // (undocumented)
  async,
  // (undocumented)
  sync
}

// @public
export function splitStyles(styles: string): ThemableArray;

// WARNING: Unsupported export: ThemableArray
// (No packageDescription for this package)
