// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @rushstack/no-new-null */
/* eslint-disable no-control-regex */

export interface IAnsiSegment {
  text: string;
  style: string;
}

interface IAnsiState {
  bold: boolean;
  underline: boolean;
  inverse: boolean;
  fg: string | null;
  bg: string | null;
}

export class AnsiSgrParser {
  private readonly _state: IAnsiState = {
    bold: false,
    underline: false,
    inverse: false,
    fg: null,
    bg: null
  };

  public process(input: string): IAnsiSegment[] {
    const csiRegex: RegExp = /\x1b\[[0-9;]*m/g;
    let match: RegExpExecArray | null;
    let lastIndex: number = 0;
    const segments: IAnsiSegment[] = [];

    const pushSegmentIfText = (text: string): void => {
      if (!text) return;
      const style: string = this._ansiStateToStyle(this._state);
      segments.push({ text, style });
    };

    while ((match = csiRegex.exec(input)) !== null) {
      const idx: number = match.index;
      if (idx > lastIndex) {
        pushSegmentIfText(input.slice(lastIndex, idx));
      }

      const seq: string = match[0];
      try {
        this._applySgr(this._parseSgrParams(seq));
      } catch {
        // Ignore malformed control sequences.
      }

      lastIndex = csiRegex.lastIndex;
    }

    if (lastIndex < input.length) {
      pushSegmentIfText(input.slice(lastIndex));
    }

    return segments;
  }

  private _parseSgrParams(seq: string): number[] {
    let s: string = seq;
    if (s.startsWith('\u001b[')) {
      s = s.slice(2);
    }
    if (s.endsWith('m')) {
      s = s.slice(0, -1);
    }
    if (!s) return [0];
    return s.split(';').map((p) => Number(p || 0));
  }

  private _applySgr(params: number[]): void {
    if (!params || !params.length) params = [0];

    for (const p of params) {
      if (p === 0) {
        this._state.bold = false;
        this._state.underline = false;
        this._state.inverse = false;
        this._state.fg = null;
        this._state.bg = null;
      } else if (p === 1) {
        this._state.bold = true;
      } else if (p === 4) {
        this._state.underline = true;
      } else if (p === 7) {
        this._state.inverse = true;
      } else if (p === 22) {
        this._state.bold = false;
      } else if (p === 24) {
        this._state.underline = false;
      } else if (p >= 30 && p <= 37) {
        this._state.fg = this._sgrColorToCss(p - 30, false);
      } else if (p === 39) {
        this._state.fg = null;
      } else if (p >= 40 && p <= 47) {
        this._state.bg = this._sgrColorToCss(p - 40, false);
      } else if (p === 49) {
        this._state.bg = null;
      } else if (p >= 90 && p <= 97) {
        this._state.fg = this._sgrColorToCss(p - 90, true);
      } else if (p >= 100 && p <= 107) {
        this._state.bg = this._sgrColorToCss(p - 100, true);
      }
    }
  }

  private _sgrColorToCss(idx: number, bright: boolean): string | null {
    const base: string[] = ['#000000', '#a00', '#0a0', '#aa0', '#00a', '#a0a', '#0aa', '#ddd'];
    const brightMap: string[] = [
      '#555',
      '#ff5555',
      '#55ff55',
      '#ffff55',
      '#5555ff',
      '#ff55ff',
      '#55ffff',
      '#fff'
    ];
    return bright ? brightMap[idx] || base[idx] : base[idx] || null;
  }

  private _ansiStateToStyle(state: IAnsiState): string {
    const styles: string[] = [];
    if (state.fg) styles.push('color: ' + state.fg);
    if (state.bg) styles.push('background-color: ' + state.bg);
    if (state.bold) styles.push('font-weight: 700');
    if (state.underline) styles.push('text-decoration: underline');
    if (state.inverse) styles.push('filter: invert(100%)');
    return styles.join('; ');
  }
}
