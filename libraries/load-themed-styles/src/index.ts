/**
 * An IThemingInstruction can specify a rawString to be preserved or a theme slot and a default value
 * to use if that slot is not specified by the theme.
 */

// Declaring a global here in case that the execution environment is Node.js (without importing the
// entire node.js d.ts for now)
declare var global: any; // tslint:disable-line:no-any

export interface IThemingInstruction {
  theme?: string;
  defaultValue?: string;
  rawString?: string;
}

export type ThemableArray = Array<IThemingInstruction>;

export interface ITheme {
  [key: string]: string;
}

interface IStyleSheet {
  cssText: string;
}

interface IExtendedHtmlStyleElement extends HTMLStyleElement {
  styleSheet: IStyleSheet;
}

interface IThemeState {
  theme: ITheme | undefined;
  lastStyleElement: IExtendedHtmlStyleElement;
  registeredStyles: IStyleRecord[];
  loadStyles: ((processedStyles: string, rawStyles?: string | ThemableArray) => void) | undefined;
}

interface IStyleRecord {
  styleElement: Element;
  themableStyle: ThemableArray;
}

// IE needs to inject styles using cssText. However, we need to evaluate this lazily, so this
// value will initialize as undefined, and later will be set once on first loadStyles injection.
let _injectStylesWithCssText: boolean;

// Store the theming state in __themeState__ global scope for reuse in the case of duplicate
// load-themed-styles hosted on the page.
const _root: any = (typeof window === 'undefined') ? global : window; // tslint:disable-line:no-any

const _themeState: IThemeState = _root.__themeState__ = _root.__themeState__ || {
  theme: undefined,
  lastStyleElement: undefined,
  registeredStyles: []
};

/**
 * Matches theming tokens. For example, "[theme: themeSlotName, default: #FFF]" (including the quotes).
 */
// tslint:disable-next-line:max-line-length
const _themeTokenRegex: RegExp = /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g;

/** Maximum style text length, for supporting IE style restrictions. */
const MAX_STYLE_CONTENT_SIZE: number = 10000;

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param {string | ThemableArray} styles Themable style text to register.
 */
export function loadStyles(styles: string | ThemableArray): void {
  const styleParts: ThemableArray = Array.isArray(styles) ? styles : splitStyles(styles);

  if (_injectStylesWithCssText === undefined) {
    _injectStylesWithCssText = shouldUseCssText();
  }

  applyThemableStyles(styleParts);
}

/**
 * Allows for customizable loadStyles logic. e.g. for server side rendering application
 * @param {(processedStyles: string, rawStyles?: string | ThemableArray) => void}
 * a loadStyles callback that gets called when styles are loaded or reloaded
 */
export function configureLoadStyles(
    loadStyles: ((processedStyles: string, rawStyles?: string | ThemableArray) => void) | undefined
  ): void {
  _themeState.loadStyles = loadStyles;
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load event
 * is fired.
 * @param {string} styleText Style to register.
 * @param {IStyleRecord} styleRecord Existing style record to re-apply.
 */
function applyThemableStyles(stylesArray: ThemableArray, styleRecord?: IStyleRecord): void {
  if (_themeState.loadStyles) {
    _themeState.loadStyles(resolveThemableArray(stylesArray), stylesArray);
  } else {
    _injectStylesWithCssText ?
      registerStylesIE(stylesArray, styleRecord) :
      registerStyles(stylesArray, styleRecord);
  }
}

/**
 * Registers a set theme tokens to find and replace. If styles were already registered, they will be
 * replaced.
 * @param {theme} theme JSON object of theme tokens to values.
 */
export function loadTheme(theme: ITheme | undefined): void {
  _themeState.theme = theme;

  // reload styles.
  reloadStyles();
}

/**
 * Clear already registered style elements and style records in theme_State object
 */
export function clearStyles(): void {
  _themeState.registeredStyles.forEach((styleRecord: IStyleRecord) => {
    const styleElement: HTMLStyleElement = styleRecord && styleRecord.styleElement as HTMLStyleElement;
    if (styleElement && styleElement.parentElement) {
      styleElement.parentElement.removeChild(styleElement);
    }
  });
  _themeState.registeredStyles = [];
}

/**
 * Reloads styles.
 */
function reloadStyles(): void {
  if (_themeState.theme) {
    for (const styleRecord of _themeState.registeredStyles) {
      applyThemableStyles(styleRecord.themableStyle, styleRecord);
    }
  }
}

/**
 * Find theme tokens and replaces them with provided theme values.
 * @param {string} styles Tokenized styles to fix.
 */
export function detokenize(styles: string | undefined): string | undefined {
  if (styles) {
    styles = resolveThemableArray(splitStyles(styles));
  }

  return styles;
}

/**
 * Resolves ThemingInstruction objects in an array and joins the result into a string.
 * @param {ThemableArray} splitStyleArray ThemableArray to resolve and join.
 */
function resolveThemableArray(splitStyleArray: ThemableArray): string {
  const { theme }: IThemeState = _themeState;
  // Resolve the array of theming instructions to an array of strings.
  // Then join the array to produce the final CSS string.
  const resolvedArray: (string | undefined)[] = (splitStyleArray || []).map((currentValue: IThemingInstruction) => {
    const themeSlot: string | undefined = currentValue.theme;
    if (themeSlot) {
      // A theming annotation. Resolve it.
      const themedValue: string | undefined = theme ? theme[themeSlot] : undefined;
      const defaultValue: string = currentValue.defaultValue || 'inherit';

      // Warn to console if we hit an unthemed value even when themes are provided, unless "DEBUG" is false
      // Allow the themedValue to be undefined to explicitly request the default value.
      if (theme && !themedValue && console && !(themeSlot in theme) && (typeof DEBUG === 'undefined' || DEBUG)) {
        console.warn(`Theming value not provided for "${themeSlot}". Falling back to "${defaultValue}".`);
      }

      return themedValue || defaultValue;
    } else {
      // A non-themable string. Preserve it.
      return currentValue.rawString;
    }
  });

  return resolvedArray.join('');
}

/**
 * Split tokenized CSS into an array of strings and theme specification objects
 * @param {string} styles Tokenized styles to split.
 */
export function splitStyles(styles: string): ThemableArray {
  const result: ThemableArray = [];
  if (styles) {
    let pos: number = 0; // Current position in styles.
    let tokenMatch: RegExpExecArray | null; // tslint:disable-line:no-null-keyword
    while (tokenMatch = _themeTokenRegex.exec(styles)) {
      const matchIndex: number = tokenMatch.index;
      if (matchIndex > pos) {
        result.push({
          rawString: styles.substring(pos, matchIndex)
        });
      }

      result.push({
        theme: tokenMatch[1],
        defaultValue: tokenMatch[2] // May be undefined
      });

      // index of the first character after the current match
      pos = _themeTokenRegex.lastIndex;
    }

    // Push the rest of the string after the last match.
    result.push({
      rawString: styles.substring(pos)
    });
  }

  return result;
}

/**
 * Registers a set of style text. If it is registered too early, we will register it when the
 * window.load event is fired.
 * @param {ThemableArray} styleArray Array of IThemingInstruction objects to register.
 * @param {IStyleRecord} styleRecord May specify a style Element to update.
 */
function registerStyles(styleArray: ThemableArray, styleRecord?: IStyleRecord): void {
  const head: HTMLHeadElement = document.getElementsByTagName('head')[0];
  const styleElement: HTMLStyleElement = document.createElement('style');

  styleElement.type = 'text/css';
  styleElement.appendChild(document.createTextNode(resolveThemableArray(styleArray)));

  if (styleRecord) {
    head.replaceChild(styleElement, styleRecord.styleElement);
    styleRecord.styleElement = styleElement;
  } else {
    head.appendChild(styleElement);
  }

  if (!styleRecord) {
    _themeState.registeredStyles.push({
      styleElement: styleElement,
      themableStyle: styleArray
    });
  }
}

/**
 * Registers a set of style text, for IE 9 and below, which has a ~30 style element limit so we need
 * to register slightly differently.
 * @param {ThemableArray} styleArray Array of IThemingInstruction objects to register.
 * @param {IStyleRecord} styleRecord May specify a style Element to update.
 */
function registerStylesIE(styleArray: ThemableArray, styleRecord?: IStyleRecord): void {
  const head: HTMLHeadElement = document.getElementsByTagName('head')[0];
  const registeredStyles: IStyleRecord[] = _themeState.registeredStyles;
  let lastStyleElement: IExtendedHtmlStyleElement = _themeState.lastStyleElement;

  const stylesheet: IStyleSheet | undefined = lastStyleElement ? lastStyleElement.styleSheet : undefined;
  const lastStyleContent: string = stylesheet ? stylesheet.cssText : '';
  let lastRegisteredStyle: IStyleRecord = registeredStyles[registeredStyles.length - 1];
  const resolvedStyleText: string = resolveThemableArray(styleArray);

  if (!lastStyleElement || (lastStyleContent.length + resolvedStyleText.length) > MAX_STYLE_CONTENT_SIZE) {
    lastStyleElement = document.createElement('style') as IExtendedHtmlStyleElement;
    lastStyleElement.type = 'text/css';

    if (styleRecord) {
      head.replaceChild(lastStyleElement, styleRecord.styleElement);
      styleRecord.styleElement = lastStyleElement;
    } else {
      head.appendChild(lastStyleElement);
    }

    if (!styleRecord) {
      lastRegisteredStyle = {
        styleElement: lastStyleElement,
        themableStyle: styleArray
      };
      registeredStyles.push(lastRegisteredStyle);
    }
  }

  lastStyleElement.styleSheet.cssText += detokenize(resolvedStyleText);
  Array.prototype.push.apply(lastRegisteredStyle.themableStyle, styleArray); // concat in-place

  // Preserve the theme state.
  _themeState.lastStyleElement = lastStyleElement;
}

/**
 * Checks to see if styleSheet exists as a property off of a style element.
 * This will determine if style registration should be done via cssText (<= IE9) or not
 */
function shouldUseCssText(): boolean {
  let useCSSText: boolean = false;

  if (typeof document !== 'undefined') {
    const emptyStyle: IExtendedHtmlStyleElement = document.createElement('style') as IExtendedHtmlStyleElement;

    emptyStyle.type = 'text/css';
    useCSSText = !!emptyStyle.styleSheet;
  }

  return useCSSText;
}
