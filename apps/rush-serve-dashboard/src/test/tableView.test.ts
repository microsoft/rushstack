// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createTableViewController } from '../modules/tableView';
import tableStyles from '../styles/tableView.module.css';

describe('table view controller', () => {
  it('renders a package/phase pivot safely and supports cell and group selection', () => {
    document.body.innerHTML = '<table><thead></thead><tbody></tbody></table><span id="stats"></span>';
    const operations = new Map([
      ['a-build', { name: 'a-build', packageName: '<package-a>', phaseName: '_phase:build', isActive: true }],
      ['a-test', { name: 'a-test', packageName: '<package-a>', phaseName: '_phase:test' }],
      ['b-build', { name: 'b-build', packageName: 'package-b', phaseName: '_phase:build' }]
    ]);
    let selection: Set<string> = new Set();
    const onSelectionMutated = jest.fn();
    const controller = createTableViewController({
      tableHead: document.querySelector('thead') ?? undefined,
      tableBody: document.querySelector('tbody') ?? undefined,
      tableStats: document.getElementById('stats') ?? undefined,
      getOperations: () => operations,
      getFilteredOperations: () => Array.from(operations.values()),
      getSelection: () => selection,
      setSelection: (next) => (selection = next),
      onSelectionMutated,
      computeDisplayStatus: () => 'Success',
      enabledGlyph: () => 'enabled',
      buildRunPolicyText: () => 'Run if affected',
      buildTooltip: (operation) => operation.name,
      statusEmoji: () => 'ok',
      overallStatusText: (status) => status || ''
    });

    controller.renderTable();

    expect(document.querySelector('thead')?.textContent).toContain('build');
    expect(document.querySelector('tbody')?.textContent).toContain('<package-a>');
    expect(document.querySelector('tbody')?.innerHTML).not.toContain('<package-a>');
    expect(document.getElementById('stats')?.textContent).toBe('3 operations');

    const firstOperationCell = document.querySelector(
      `td.${tableStyles.pivotCell}[title="a-build"]`
    ) as HTMLElement;
    firstOperationCell.click();
    expect(selection).toEqual(new Set(['a-build']));

    const firstPackageCell = document.querySelector(`.${tableStyles.pkgCell}`) as HTMLElement;
    firstPackageCell.click();
    expect(selection).toEqual(new Set(['a-build', 'a-test']));
    expect(onSelectionMutated).toHaveBeenCalledTimes(2);
  });
});
