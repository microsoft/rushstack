// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiSgrParser } from './ansiSgrParser';

interface ITerminalElementWithState extends HTMLElement {
  _savedWidth?: number;
}

export interface ITerminalPaneRefs {
  terminalEl: HTMLElement | undefined;
  terminalBody: HTMLElement | undefined;
  termClearBtn: HTMLElement | undefined;
  termAutoScrollCheckbox: HTMLInputElement | undefined;
  termAutoscrollBtn: HTMLElement | undefined;
  toggleTerminalBtn: HTMLElement | undefined;
  resizerEl: HTMLElement | undefined;
}

export interface ITerminalPaneController {
  appendChunk(kind: string | undefined, text: string | undefined): void;
}

export function createTerminalPaneController(refs: ITerminalPaneRefs): ITerminalPaneController {
  const ansiParser: AnsiSgrParser = new AnsiSgrParser();
  _wireLayoutInit(refs.terminalEl);
  _wireClearButton(refs.terminalBody, refs.termClearBtn);
  _wireResizer(refs.terminalEl, refs.resizerEl);
  _wireToggle(refs);

  return {
    appendChunk(kind: string | undefined, text: string | undefined): void {
      _appendChunk(refs, ansiParser, kind, text);
    }
  };
}

function _appendChunk(
  refs: ITerminalPaneRefs,
  ansiParser: AnsiSgrParser,
  kind: string | undefined,
  text: string | undefined
): void {
  const { terminalEl, terminalBody, termAutoScrollCheckbox } = refs;
  if (!terminalBody) return;

  const raw: string = String(text || '');
  const segments: Array<{ text: string; style?: string }> = ansiParser.process(raw);

  if (segments && segments.length) {
    for (const seg of segments) {
      const span: HTMLSpanElement = document.createElement('span');
      span.className = 'term-chunk ' + (kind === 'stderr' ? 'stderr' : 'stdout');
      if (seg.style) span.setAttribute('style', seg.style);
      span.textContent = seg.text;
      terminalBody.appendChild(span);
    }
  }

  if (!termAutoScrollCheckbox || termAutoScrollCheckbox.checked) {
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  if (terminalEl && !terminalEl.classList.contains('hidden')) {
    terminalEl.classList.add('term-flash');
    setTimeout(() => terminalEl.classList.remove('term-flash'), 350);
  }
}

function _wireLayoutInit(terminalEl: HTMLElement | undefined): void {
  try {
    if (terminalEl) {
      terminalEl.style.top = '';
    }
  } catch {
    // no-op
  }
}

function _wireClearButton(
  terminalBody: HTMLElement | undefined,
  termClearBtn: HTMLElement | undefined
): void {
  if (!terminalBody || !termClearBtn) return;

  termClearBtn.addEventListener('click', () => {
    terminalBody.innerHTML = '';
  });
}

function _wireResizer(terminalEl: HTMLElement | undefined, resizerEl: HTMLElement | undefined): void {
  if (!terminalEl || !resizerEl) return;

  const terminalWithState: ITerminalElementWithState = terminalEl as ITerminalElementWithState;
  let dragging: boolean = false;
  let startX: number = 0;
  let startWidth: number = 0;
  const minW: number = 120;
  const maxW: number = Math.max(240, window.innerWidth - 200);

  resizerEl.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true;
    startX = e.clientX;
    startWidth = terminalWithState.getBoundingClientRect().width;
    resizerEl.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    const dx: number = startX - e.clientX;
    let newW: number = startWidth + dx;
    newW = Math.max(minW, Math.min(maxW, newW));

    terminalWithState._savedWidth = newW;
    if (!terminalWithState.classList.contains('hidden')) {
      terminalWithState.style.width = newW + 'px';
      terminalWithState.style.flex = '0 0 ' + newW + 'px';
    }
  });

  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      resizerEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore mismatched pointer state
    }
    document.body.style.userSelect = '';
  });

  resizerEl.tabIndex = 0;
  resizerEl.addEventListener('keydown', (e: KeyboardEvent) => {
    const step: number = 16;
    const rect: DOMRect = terminalWithState.getBoundingClientRect();
    let w: number = rect.width;
    if (e.key === 'ArrowLeft') w = Math.max(minW, w - step);
    else if (e.key === 'ArrowRight') w = Math.min(maxW, w + step);

    terminalWithState._savedWidth = w;
    if (!terminalWithState.classList.contains('hidden')) {
      terminalWithState.style.width = w + 'px';
      terminalWithState.style.flex = '0 0 ' + w + 'px';
    }
  });
}

function _wireToggle(refs: ITerminalPaneRefs): void {
  const { toggleTerminalBtn, terminalEl, resizerEl, termAutoscrollBtn, termAutoScrollCheckbox } = refs;
  if (!toggleTerminalBtn || !terminalEl) return;

  const terminalWithState: ITerminalElementWithState = terminalEl as ITerminalElementWithState;

  toggleTerminalBtn.addEventListener('click', () => {
    const currentlyHidden: boolean = terminalWithState.classList.contains('hidden');

    if (currentlyHidden) {
      terminalWithState.classList.remove('hidden');
      if (resizerEl) resizerEl.classList.remove('hidden');

      if (terminalWithState._savedWidth) {
        terminalWithState.style.width = terminalWithState._savedWidth + 'px';
        terminalWithState.style.flex = '0 0 ' + terminalWithState._savedWidth + 'px';
      } else {
        terminalWithState.style.width = '';
        terminalWithState.style.flex = '';
      }

      if (resizerEl) resizerEl.tabIndex = 0;
      toggleTerminalBtn.setAttribute('aria-pressed', 'true');
      toggleTerminalBtn.classList.add('active');
    } else {
      try {
        terminalWithState._savedWidth = terminalWithState.getBoundingClientRect().width;
      } catch {
        // no-op
      }

      terminalWithState.classList.add('hidden');
      if (resizerEl) {
        resizerEl.classList.add('hidden');
        resizerEl.tabIndex = -1;
      }

      terminalWithState.style.width = '';
      terminalWithState.style.flex = '';
      toggleTerminalBtn.setAttribute('aria-pressed', 'false');
      toggleTerminalBtn.classList.remove('active');
    }
  });

  const isVisible: boolean = !terminalWithState.classList.contains('hidden');
  toggleTerminalBtn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
  if (isVisible) toggleTerminalBtn.classList.add('active');
  else toggleTerminalBtn.classList.remove('active');

  if (termAutoscrollBtn && termAutoScrollCheckbox) {
    termAutoscrollBtn.setAttribute('aria-pressed', termAutoScrollCheckbox.checked ? 'true' : 'false');
    termAutoscrollBtn.addEventListener('click', () => {
      const newVal: boolean = !termAutoScrollCheckbox.checked;
      termAutoScrollCheckbox.checked = newVal;
      termAutoscrollBtn.setAttribute('aria-pressed', newVal ? 'true' : 'false');
    });
  }
}
