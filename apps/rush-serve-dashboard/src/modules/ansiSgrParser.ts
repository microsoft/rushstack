// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IAnsiSegment {
  text: string;
  style: string;
}

interface IAnsiState {
  bold: boolean;
  underline: boolean;
  inverse: boolean;
  fg?: string;
  bg?: string;
}

export class AnsiSgrParser {
  readonly #state: IAnsiState = {
    bold: false,
    underline: false,
    inverse: false,
    fg: undefined,
    bg: undefined
  };

  public process(input: string): IAnsiSegment[] {
    let lastIndex: number = 0;
    let searchIndex: number = 0;
    const segments: IAnsiSegment[] = [];

    const pushSegmentIfText = (text: string): void => {
      if (!text) return;
      const style: string = this.#ansiStateToStyle(this.#state);
      segments.push({ text, style });
    };

    while (searchIndex < input.length) {
      const escapeIndex: number = input.indexOf('\u001b[', searchIndex);
      if (escapeIndex < 0) break;

      const suffixMatch: RegExpExecArray | undefined =
        /^[0-9;]*m/.exec(input.slice(escapeIndex + 2)) ?? undefined;
      if (!suffixMatch) {
        searchIndex = escapeIndex + 2;
        continue;
      }

      if (escapeIndex > lastIndex) {
        pushSegmentIfText(input.slice(lastIndex, escapeIndex));
      }

      const sequenceEnd: number = escapeIndex + 2 + suffixMatch[0].length;
      const seq: string = input.slice(escapeIndex, sequenceEnd);
      try {
        this.#applySgr(this.#parseSgrParams(seq));
      } catch {
        // Ignore malformed control sequences.
      }

      lastIndex = sequenceEnd;
      searchIndex = sequenceEnd;
    }

    if (lastIndex < input.length) {
      pushSegmentIfText(input.slice(lastIndex));
    }

    return segments;
  }

  #parseSgrParams(seq: string): number[] {
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

  #applySgr(params: number[]): void {
    if (!params || !params.length) params = [0];

    for (const p of params) {
      if (p === 0) {
        this.#state.bold = false;
        this.#state.underline = false;
        this.#state.inverse = false;
        this.#state.fg = undefined;
        this.#state.bg = undefined;
      } else if (p === 1) {
        this.#state.bold = true;
      } else if (p === 4) {
        this.#state.underline = true;
      } else if (p === 7) {
        this.#state.inverse = true;
      } else if (p === 22) {
        this.#state.bold = false;
      } else if (p === 24) {
        this.#state.underline = false;
      } else if (p >= 30 && p <= 37) {
        this.#state.fg = this.#sgrColorToCss(p - 30, false);
      } else if (p === 39) {
        this.#state.fg = undefined;
      } else if (p >= 40 && p <= 47) {
        this.#state.bg = this.#sgrColorToCss(p - 40, false);
      } else if (p === 49) {
        this.#state.bg = undefined;
      } else if (p >= 90 && p <= 97) {
        this.#state.fg = this.#sgrColorToCss(p - 90, true);
      } else if (p >= 100 && p <= 107) {
        this.#state.bg = this.#sgrColorToCss(p - 100, true);
      }
    }
  }

  #sgrColorToCss(idx: number, bright: boolean): string | undefined {
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
    return bright ? brightMap[idx] || base[idx] : base[idx];
  }

  #ansiStateToStyle(state: IAnsiState): string {
    const styles: string[] = [];
    if (state.fg) styles.push('color: ' + state.fg);
    if (state.bg) styles.push('background-color: ' + state.bg);
    if (state.bold) styles.push('font-weight: 700');
    if (state.underline) styles.push('text-decoration: underline');
    if (state.inverse) styles.push('filter: invert(100%)');
    return styles.join('; ');
  }
}
