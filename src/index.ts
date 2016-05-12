/**
 * An IThemingInstruction can specify a rawString to be preserved or a theme slot and a default value
 * to use if that slot is not specified by the theme.
 */
export interface IThemingInstruction {
  theme?: string;
  defaultValue?: string;
  rawString?: string;
};

export type ThemableArray = Array<IThemingInstruction>;

interface IThemeState {
  theme: { [key: string]: string };
  lastStyleElement: HTMLStyleElement;
  registeredStyles: IStyleRecord[];
}

interface IStyleRecord {
  styleElement: Element;
  themableStyle: ThemableArray;
};

// IE needs to inject styles using cssText. However, we need to evaluate this lazily, so this
// value will initialize as undefined, and later will be set once on first loadStyles injection.
let _injectStylesWithCssText: boolean;

// Store the theming state in __themeState__ global scope for reuse in the case of duplicate
// load-themed-styles hosted on the page.
const _root: any = (typeof window === 'undefined') ? {} : window;

const _themeState: IThemeState = _root.__themeState__ = _root.__themeState__ || {
  theme: null,
  lastStyleElement: null,
  registeredStyles: []
};

/**
 * Matches theming tokens. For example, "[theme: themeSlotName, default: #FFF]" (including the quotes).
 */
/* tslint:disable: max-line-length */
const _themeTokenRegex = /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g;
/* tslint:enable: max-line-length */

/** Maximum style text length, for supporting IE style restrictions. */
const MAX_STYLE_CONTENT_SIZE = 10000;

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param {string | ThemableArray} styles Themable style text to register.
 */
export function loadStyles(styles: string | ThemableArray) {
  let styleParts: ThemableArray = Array.isArray(styles) ? styles : splitStyles(styles);

  if (_injectStylesWithCssText === undefined) {
    _injectStylesWithCssText = shouldUseCssText();
  }

  applyThemableStyles(styleParts);
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load event
 * is fired.
 * @param {string} styleText Style to register.
 * @param {IStyleRecord} styleRecord Existing style record to re-apply.
 */
function applyThemableStyles(styles: ThemableArray, styleRecord?: IStyleRecord) {
  _injectStylesWithCssText ?
    registerStylesIE(styles, styleRecord) :
    registerStyles(styles, styleRecord);
}

/**
 * Registers a set theme tokens to find and replace. If styles were already registered, they will be
 * replaced.
 * @param {any} theme JSON object of theme tokens to values.
 */
export function loadTheme(theme: any) {
  _themeState.theme = theme;

  // reload styles.
  reloadStyles();
}

/**
 * Reloads styles.
 * @param {any} theme JSON object of theme tokens to values.
 */
function reloadStyles(): void {
  if (_themeState.theme) {
    for (let styleRecord of _themeState.registeredStyles) {
      applyThemableStyles(styleRecord.themableStyle, styleRecord);
    }
  }
}

/**
 * Find theme tokens and replaces them with provided theme values.
 * @param {string} styles Tokenized styles to fix.
 */
export function detokenize(styles: string): string {
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
  let { theme } = _themeState;
  let resolvedCss: string;
  if (splitStyleArray) {
    // Resolve the array of theming instructions to an array of strings.
    // Then join the array to produce the final CSS string.
    let resolvedArray = splitStyleArray.map((currentValue: IThemingInstruction) => {
      let themeSlot = currentValue.theme;
      if (themeSlot != null) {
        // A theming annotation. Resolve it.
        let themedValue = theme ? theme[themeSlot] : null;
        let defaultValue = currentValue.defaultValue;

        // Warn to console if we hit an unthemed value even when themes are provided.
        // Allow the themedValue to be null to explicitly request the default value.
        if (theme && !themedValue && console && !(themeSlot in theme)) {
          /* tslint:disable: max-line-length */
          console.warn(`Theming value not provided for "${themeSlot}". Falling back to "${defaultValue || 'inherit'}".`);
          /* tslint:enable: max-line-length */
        }

        return themedValue || defaultValue || 'inherit';
      } else {
        // A non-themable string. Preserve it.
        return currentValue.rawString;
      }
    });

    resolvedCss = resolvedArray.join('');
  }

  return resolvedCss;
}

/**
 * Split tokenized CSS into an array of strings and theme specification objects
 * @param {string} styles Tokenized styles to split.
 */
export function splitStyles(styles: string): ThemableArray {
  let result: ThemableArray = [];
  if (styles) {
    let pos = 0; // Current position in styles.
    let tokenMatch;
    while (tokenMatch = _themeTokenRegex.exec(styles)) {
      let matchIndex: number = tokenMatch.index;
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
  let head = document.getElementsByTagName('head')[0];
  let styleElement = document.createElement('style');

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
function registerStylesIE(styleArray: ThemableArray, styleRecord?: IStyleRecord) {
  let head = document.getElementsByTagName('head')[0];
  let { lastStyleElement, registeredStyles } = _themeState;

  let stylesheet = lastStyleElement ? (lastStyleElement as any).styleSheet : null;
  let lastStyleContent = stylesheet ? stylesheet.cssText : '';
  let lastRegisteredStyle = registeredStyles[registeredStyles.length - 1];
  let resolvedStyleText = resolveThemableArray(styleArray);

  if (!lastStyleElement || (lastStyleContent.length + resolvedStyleText.length) > MAX_STYLE_CONTENT_SIZE) {
    lastStyleElement = document.createElement('style');
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

  (lastStyleElement as any).styleSheet.cssText += detokenize(resolvedStyleText);
  Array.prototype.push.apply(lastRegisteredStyle.themableStyle, styleArray); // concat in-place

  // Preserve the theme state.
  _themeState.lastStyleElement = lastStyleElement;
}

/**
 * Checks to see if styleSheet exists as a property off of a style element.
 * This will determine if style registration should be done via cssText (<= IE9) or not
 */
function shouldUseCssText(): boolean {
  let useCSSText = false;

  if (typeof document !== 'undefined') {
    let emptyStyle = document.createElement('style') as any;

    emptyStyle.type = 'text/css';
    useCSSText = !!emptyStyle.styleSheet;
  }

  return useCSSText;
}
