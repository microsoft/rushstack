// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ISelectionBarControllerOptions {
  getSelection: () => Set<string>;
  getCurrentView: () => string;
  isConnected: () => boolean;
}

export interface ISelectionBarController {
  updateSelectionUI: () => void;
}

const selectionButtonsIds: string[] = [
  'invalidate-btn',
  'close-runners-btn',
  'set-enabled-default-btn',
  'set-enabled-ignore-deps-btn',
  'set-enabled-disabled-btn',
  'expand-deps-btn',
  'expand-consumers-btn'
];

export function createSelectionBarController(
  options: ISelectionBarControllerOptions
): ISelectionBarController {
  const updateSelectionUI = (): void => {
    const bar: HTMLElement | null = document.getElementById('selection-bar');
    if (!bar) return;

    bar.style.display = 'flex';
    const headingSpan: HTMLElement | null = document.getElementById('view-heading-text');
    if (headingSpan) {
      headingSpan.textContent =
        options.getCurrentView() === 'graph' ? 'Dependency Graph' : 'Operations Table';
    }

    const hasSelection: boolean = options.getSelection().size > 0;
    const connected: boolean = options.isConnected();
    selectionButtonsIds.forEach((id) => {
      const el: HTMLButtonElement | HTMLInputElement | null = document.getElementById(id) as
        | HTMLButtonElement
        | HTMLInputElement
        | null;
      if (el) el.disabled = !(hasSelection && connected);
    });

    const clearBtn: HTMLButtonElement | null = document.getElementById(
      'clear-selection-btn'
    ) as HTMLButtonElement | null;
    if (clearBtn) {
      clearBtn.disabled = !(hasSelection && connected);
      clearBtn.title = 'Clear selection';
      clearBtn.setAttribute('aria-label', 'Clear selection');
    }

    const countSpan: HTMLElement | null = document.getElementById('selection-count');
    if (countSpan) {
      const count: number = options.getSelection().size;
      countSpan.textContent = count + (count === 1 ? ' selected' : ' selected');
    }
  };

  return {
    updateSelectionUI
  };
}
