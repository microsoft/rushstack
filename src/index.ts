export interface IStyleRecord {
  styleElement: Element;
  untokenizedStyles: string;
};

let _lastStyleElement: any = null;
let _styleText = '';
let _theme = null;
let _areUnlimitedStylesheetsSupported = !shouldUseCssText();
let _registeredStyles: IStyleRecord[] = [] as IStyleRecord[];

/** Maximum style text length, for supporting IE style restrictions. */
const MAX_STYLE_CONTENT_SIZE = 10000;

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load event is fired.
 * @param {string} styleText Style to register.
 */
export function loadStyles(styles: string, styleRecord?: IStyleRecord) {
  _areUnlimitedStylesheetsSupported ? registerStyles(styles, styleRecord) : registerStylesIE(styles, styleRecord);
}

/**
 * Registers a set theme tokens to find and replace. If styles were already registered, they will be replaced.
 * @param {any} theme JSON object of theme tokens to values.
 */
export function loadTheme(theme: any) {
  _theme = theme;

  // reload styles.
  reloadStyles();
}

/**
 * Reloads styles.
 * @param {any} theme JSON object of theme tokens to values.
 */
function reloadStyles(): void {
  if (_theme) {
    for (let styleRecord of _registeredStyles) {
      loadStyles(styleRecord.untokenizedStyles, styleRecord);
    }
  }
}

/**
 * Find theme tokens and replaces them with provided theme values.
 * @param {string} styles Tokenized styles to fix.
 */
export function detokenize(styles: string): string {
  if (styles) {
    styles = styles.replace(
      /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g,
      (
        match: string,
        themeVariable: string,
        defaultValue: string
      ): string => {
        let themedValue = _theme ? _theme[themeVariable] : null;

        // Warn to console if we hit an unthemed value even when themes are provided.
        if (_theme && !themedValue && console) {
          console.warn(`Themed style value not provided for "${ themeVariable }". Falling back to "${ defaultValue || 'inherit' }".`);
        }

        return themedValue || defaultValue || 'inherit';
      });
  }

  return styles;
}

/**
 * Registers a set of style text. If it is registered too early, we will register it when the window.load event is fired.
 * @param {string} styleText Style to register.
 */
function registerStyles(styleText: string, styleRecord?: IStyleRecord): void {
  let head = document.getElementsByTagName('head')[0];
  let styleElement = document.createElement('style');

  styleElement.type = 'text/css';
  styleElement.appendChild(document.createTextNode(detokenize(styleText)));

  if (styleRecord) {
    head.replaceChild(styleElement, styleRecord.styleElement);
    styleRecord.styleElement = styleElement;
  } else {
    head.appendChild(styleElement);
  }

  if (!styleRecord) {
    _registeredStyles.push({
      styleElement: styleElement,
      untokenizedStyles: styleText
    });
  }
}

/**
 * Registers a set of style text, for IE 9 and below, which has a ~30 style element limit so we need to register slightly differently.
 * @param {string} styleText Style to register.
 */
function registerStylesIE(styleText: string, styleRecord?: IStyleRecord) {
  let head = document.getElementsByTagName('head')[0];
  let stylesheet = _lastStyleElement ? (_lastStyleElement as any).styleSheet : null;
  let lastStyleContent = stylesheet ? stylesheet.cssText : '';
  let lastRegisteredStyle = _registeredStyles[_registeredStyles.length - 1];

  if (!_lastStyleElement || (lastStyleContent.length + _styleText.length) > MAX_STYLE_CONTENT_SIZE) {
    _lastStyleElement = document.createElement('style');
    _lastStyleElement.type = 'text/css';

    if (styleRecord) {
      head.replaceChild(_lastStyleElement, styleRecord.styleElement);
      styleRecord.styleElement = _lastStyleElement;
    } else {
      head.appendChild(_lastStyleElement);
    }

    if (!styleRecord) {
      lastRegisteredStyle = {
        styleElement: _lastStyleElement,
        untokenizedStyles: ''
      };
      _registeredStyles.push(lastRegisteredStyle);
    }
  }

  _lastStyleElement.styleSheet.cssText += detokenize(styleText);
  lastRegisteredStyle.untokenizedStyles += styleText;
}

/**
 * Checks to see if styleSheet exists as a property off of a style element.
 * This will determine if style registration should be done via cssText (<= IE9) or not
 */
function shouldUseCssText(): boolean {
  let emptyStyle = document.createElement('style') as any;
  emptyStyle.type = 'text/css';

  return !!emptyStyle.styleSheet;
}
