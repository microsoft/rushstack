// @public
export function configureLoadStyles(loadStylesFunction: ((processedStyles: string, rawStyles?: string | IThemingInstruction[]) => void) | undefined): void;

// @public
export function flush(): void;

// @public
interface ITheme {
  // (undocumented)
  [ key: string ]: string;
}

// @public
interface IThemingInstruction {
  defaultValue?: string;
  rawString?: string;
  theme?: string;
}

// @public
export function loadStyles(styles: string | IThemingInstruction[]): void;

// @public
export function loadStylesAsync(styles: string | IThemingInstruction[]): void;

// @public
export function loadTheme(theme: ITheme | undefined): void;

// @public
export function splitStyles(styles: string): IThemingInstruction[];

