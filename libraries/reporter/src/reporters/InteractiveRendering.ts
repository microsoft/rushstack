// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The spinner frames used by the interactive live region.
 *
 * @beta
 */
export const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * The minimum interval between interactive refreshes, in milliseconds (10 Hz).
 *
 * @beta
 */
export const MIN_REFRESH_INTERVAL_MS: number = 100;

/**
 * The snapshot of live state rendered into the three-row region.
 *
 * @beta
 */
export interface ILiveRegionState {
  /**
   * The command name.
   */
  readonly commandName?: string;

  /**
   * The total number of registered operations.
   */
  readonly totalOperations: number;

  /**
   * The number of completed operations.
   */
  readonly completedOperations: number;

  /**
   * The number of failed operations.
   */
  readonly failedOperations: number;

  /**
   * The projects with currently executing operations.
   */
  readonly activeProjects: readonly string[];

  /**
   * The latest activity, liveness, or result line.
   */
  readonly latestActivity: string;
}

/**
 * Resolves whether color is enabled from the environment and TTY capability.
 *
 * @remarks
 * `NO_COLOR` disables color regardless of other settings. `FORCE_COLOR` enables
 * it unless set to `0` or `false`. Otherwise color follows TTY capability. No
 * new global color flag is introduced.
 *
 * @param env - the environment variables
 * @param isTTY - whether the output is an interactive TTY
 *
 * @beta
 */
export function resolveColorEnabled(env: Record<string, string | undefined>, isTTY: boolean): boolean {
  if (env.NO_COLOR !== undefined) {
    return false;
  }
  const force: string | undefined = env.FORCE_COLOR;
  if (force !== undefined) {
    return !(force === '0' || force.toLowerCase() === 'false');
  }
  return isTTY;
}

/**
 * A set of color functions.
 *
 * @beta
 */
export interface IColorizer {
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
  bold(text: string): string;
}

function wrap(open: number, text: string, enabled: boolean): string {
  return enabled ? `\u001b[${open}m${text}\u001b[0m` : text;
}

/**
 * Creates a colorizer that emits ANSI codes only when enabled.
 *
 * @param enabled - whether color is enabled
 *
 * @beta
 */
export function createColorizer(enabled: boolean): IColorizer {
  return {
    dim: (text: string): string => wrap(2, text, enabled),
    red: (text: string): string => wrap(31, text, enabled),
    green: (text: string): string => wrap(32, text, enabled),
    yellow: (text: string): string => wrap(33, text, enabled),
    cyan: (text: string): string => wrap(36, text, enabled),
    bold: (text: string): string => wrap(1, text, enabled)
  };
}

const COMBINING_MARK_REGEXP: RegExp = /\p{Mark}/u;
const EXTENDED_PICTOGRAPHIC_REGEXP: RegExp = /\p{Extended_Pictographic}/u;

function splitGraphemes(text: string): string[] {
  const graphemes: string[] = [];
  let current: string = '';
  let regionalIndicatorCount: number = 0;
  for (const symbol of text) {
    const codePoint: number = symbol.codePointAt(0)!;
    const isRegionalIndicator: boolean = codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
    const extendsCurrent: boolean =
      current.length > 0 &&
      (COMBINING_MARK_REGEXP.test(symbol) ||
        codePoint === 0xfe0f ||
        (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
        current.endsWith('\u200d') ||
        symbol === '\u200d' ||
        (isRegionalIndicator && regionalIndicatorCount === 1));
    if (!extendsCurrent && current.length > 0) {
      graphemes.push(current);
      current = '';
      regionalIndicatorCount = 0;
    }
    current += symbol;
    regionalIndicatorCount = isRegionalIndicator ? regionalIndicatorCount + 1 : 0;
  }
  if (current.length > 0) {
    graphemes.push(current);
  }
  return graphemes;
}

function isFullWidthCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

function getGraphemeWidth(grapheme: string): number {
  if (EXTENDED_PICTOGRAPHIC_REGEXP.test(grapheme)) {
    return 2;
  }
  let width: number = 0;
  for (const symbol of grapheme) {
    if (COMBINING_MARK_REGEXP.test(symbol) || symbol === '\u200d' || symbol === '\ufe0f') {
      continue;
    }
    width += isFullWidthCodePoint(symbol.codePointAt(0)!) ? 2 : 1;
  }
  return width;
}

function getDisplayWidth(text: string): number {
  let width: number = 0;
  for (const grapheme of splitGraphemes(text)) {
    width += getGraphemeWidth(grapheme);
  }
  return width;
}

/**
 * Truncates a line to a maximum width, adding an ellipsis when it overflows.
 *
 * @beta
 */
export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  if (getDisplayWidth(text) <= width) {
    return text;
  }
  if (width === 1) {
    return '…';
  }
  let result: string = '';
  let usedWidth: number = 0;
  for (const grapheme of splitGraphemes(text)) {
    const segmentWidth: number = getGraphemeWidth(grapheme);
    if (usedWidth + segmentWidth + 1 > width) {
      break;
    }
    result += grapheme;
    usedWidth += segmentWidth;
  }
  return `${result}…`;
}

/**
 * Renders the width-aware active-projects row with a `+N more` suffix.
 *
 * @param projects - the active project names
 * @param width - the available width
 *
 * @beta
 */
export function renderActiveProjectsRow(projects: readonly string[], width: number): string {
  if (projects.length === 0) {
    return '';
  }
  const shown: string[] = [];
  for (let index: number = 0; index < projects.length; index++) {
    const tentative: string = [...shown, projects[index]].join(', ');
    const remaining: number = projects.length - (index + 1);
    const suffix: string = remaining > 0 ? ` +${remaining} more` : '';
    if (getDisplayWidth(tentative) + getDisplayWidth(suffix) > width && shown.length > 0) {
      const hidden: number = projects.length - shown.length;
      return `${shown.join(', ')} +${hidden} more`;
    }
    shown.push(projects[index]);
  }
  return shown.join(', ');
}

/**
 * Options for {@link renderLiveRegion}.
 *
 * @beta
 */
export interface IRenderLiveRegionOptions {
  /**
   * The terminal width.
   */
  readonly width: number;

  /**
   * The current spinner frame.
   */
  readonly spinnerFrame: string;

  /**
   * The colorizer.
   */
  readonly color: IColorizer;
}

/**
 * Renders the three-row live region.
 *
 * @remarks
 * Row one is aggregate phase progress with a spinner, row two is the width-aware
 * active projects with a `+N more` suffix, and row three is the latest activity.
 *
 * @param state - the live state
 * @param options - width, spinner, and color
 *
 * @beta
 */
export function renderLiveRegion(state: ILiveRegionState, options: IRenderLiveRegionOptions): string[] {
  const { width, spinnerFrame, color } = options;

  const failedText: string = state.failedOperations > 0 ? `  ${state.failedOperations} failed` : '';
  const progressRow: string =
    `${spinnerFrame} ${state.commandName ?? 'rush'}  ` +
    `${state.completedOperations}/${state.totalOperations}${failedText}`;

  const activeRow: string = renderActiveProjectsRow(state.activeProjects, width);
  const activityRow: string = state.latestActivity;

  // Color is applied after truncation so ANSI codes never affect the width or
  // get split mid-sequence.
  return [
    color.cyan(truncateToWidth(progressRow, width)),
    color.dim(truncateToWidth(activeRow, width)),
    truncateToWidth(activityRow, width)
  ];
}

/**
 * Returns `true` if the live region may refresh, capping the rate at 10 Hz.
 *
 * @param lastPaintMs - the time of the last paint
 * @param nowMs - the current time
 * @param minIntervalMs - the minimum interval; defaults to 100 ms
 *
 * @beta
 */
export function shouldRefresh(
  lastPaintMs: number,
  nowMs: number,
  minIntervalMs: number = MIN_REFRESH_INTERVAL_MS
): boolean {
  return nowMs - lastPaintMs >= minIntervalMs;
}
