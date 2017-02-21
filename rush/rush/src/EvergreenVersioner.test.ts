/// <reference types="mocha" />

import { assert } from 'chai';
import { EvergreenVersioner } from './EvergreenVersioner';


function convertProjectInfoToMap(object: { [project: string]: { [version: string]: { [dependency: string]: string } } }) {
  const map: Map<string, Map<string, { [dependency: string]: string }>> = new Map<string, Map<string, { [dependency: string]: string }>>();
  Object.keys(object).forEach((project: string) => {
    map.set(project, new Map<string, { [dependency: string]: string }>());
    Object.keys(object[project]).forEach((version: string) => {
      map.get(project).set(version, object[project][version]);
    });
  });
  return map;
}


describe('EvergreenVersioner', () => {
  it('will update in simple case', () => {
    const evergreenPackages: Map<string, string> = new Map<string, string>();
    evergreenPackages.set('B', '0.0.1');

    const versioner: EvergreenVersioner = new EvergreenVersioner(
      evergreenPackages,
      convertProjectInfoToMap({
        'A': {
          '1.0.0': {
            B: '0.0.1'
          }
        },
        'B': {
          '0.0.1': {},
          '0.0.2': {}
        }
      })
    );

    const newVersions: Map<string, string> = versioner.solve(['B']);

    assert.notEqual(newVersions, undefined);
    assert.equal(newVersions.size, 1, 'There should be 1 updated version');
    assert.isTrue(newVersions.has('B'), 'Evergreen package "B" was solved');
    assert.equal(newVersions.get('B'), '0.0.2', 'Evergreen package "B" was bumped to 0.0.2');
  });

  it('will bump two packages', () => {
    const evergreenPackages: Map<string, string> = new Map<string, string>();
    evergreenPackages.set('B', '0.0.1');
    evergreenPackages.set('C', '99.0.0');

    const versioner: EvergreenVersioner = new EvergreenVersioner(
      evergreenPackages,
      convertProjectInfoToMap({
        'A': {
          '1.0.0': {
            B: '0.0.1',
            C: '99.0.0'
          }
        },
        'B': {
          '0.0.1': {},
          '0.0.2': {}
        },
        'C': {
          '99.0.0': {},
          '100.0.0': {}
        }
      })
    );

    const newVersions: Map<string, string> = versioner.solve(['B', 'C']);

    assert.notEqual(newVersions, undefined);
    assert.equal(newVersions.size, 2, 'There should be 2 updated version');
    assert.isTrue(newVersions.has('B'), 'Evergreen package "B" was solved');
    assert.equal(newVersions.get('B'), '0.0.2', 'Evergreen package "B" was bumped to 0.0.2');
    assert.isTrue(newVersions.has('C'), 'Evergreen package "C" was solved');
    assert.equal(newVersions.get('C'), '100.0.0', 'Evergreen package "C" was bumped to 100.0.0');
  });

  it('will only bump one of two evergreen packages if only 1 is asked for', () => {
    const evergreenPackages: Map<string, string> = new Map<string, string>();
    evergreenPackages.set('B', '0.0.1');
    evergreenPackages.set('C', '99.0.0');

    const versioner: EvergreenVersioner = new EvergreenVersioner(
      evergreenPackages,
      convertProjectInfoToMap({
        'A': {
          '1.0.0': {
            B: '0.0.1',
            C: '99.0.0'
          }
        },
        'B': {
          '0.0.1': {},
          '0.0.2': {}
        },
        'C': {
          '99.0.0': {},
          '100.0.0': {}
        }
      })
    );

    const newVersions: Map<string, string> = versioner.solve(['B']);

    assert.notEqual(newVersions, undefined);
    assert.equal(newVersions.size, 2, 'There should be 2 updated version');
    assert.isTrue(newVersions.has('B'), 'Evergreen package "B" was solved');
    assert.equal(newVersions.get('B'), '0.0.2', 'Evergreen package "B" was bumped to 0.0.2');
    assert.isTrue(newVersions.has('C'), 'Evergreen package "C" was solved');
    assert.equal(newVersions.get('C'), '99.0.0', 'Evergreen package "C" was unchanged');
  });

  it('will bump two interdependent packages', () => {
    const evergreenPackages: Map<string, string> = new Map<string, string>();
    evergreenPackages.set('B', '0.0.1');
    evergreenPackages.set('C', '99.0.0');

    const versioner: EvergreenVersioner = new EvergreenVersioner(
      evergreenPackages,
      convertProjectInfoToMap({
        'A': {
          '1.0.0': {
            B: '0.0.1',
            C: '99.0.0'
          }
        },
        'B': {
          '0.0.1': {
            'C': '99.0.0'
          },
          '0.0.2': {
            'C': '100.0.0'
          }
        },
        'C': {
          '99.0.0': {},
          '100.0.0': {}
        }
      })
    );

    const newVersions: Map<string, string> = versioner.solve(['B', 'C']);

    assert.notEqual(newVersions, undefined);
    assert.equal(newVersions.size, 2, 'There should be 2 updated version');
    assert.isTrue(newVersions.has('B'), 'Evergreen package "B" was solved');
    assert.equal(newVersions.get('B'), '0.0.2', 'Evergreen package "B" was bumped to 0.0.2');
    assert.isTrue(newVersions.has('C'), 'Evergreen package "C" was solved');
    assert.equal(newVersions.get('C'), '100.0.0', 'Evergreen package "C" was bumped to 100.0.0');
  });

  it('will not bump version of C if B depends on old version of C', () => {
    const evergreenPackages: Map<string, string> = new Map<string, string>();
    evergreenPackages.set('B', '0.0.1');
    evergreenPackages.set('C', '99.0.0');

    const versioner: EvergreenVersioner = new EvergreenVersioner(
      evergreenPackages,
      convertProjectInfoToMap({
        'A': {
          '1.0.0': {
            B: '0.0.1',
            C: '99.0.0'
          }
        },
        'B': {
          '0.0.1': {
            'C': '99.0.0'
          },
          '0.0.2': {
            'C': '99.0.0'
          }
        },
        'C': {
          '99.0.0': {},
          '100.0.0': {}
        }
      })
    );

    const newVersions: Map<string, string> = versioner.solve(['B', 'C']);

    assert.notEqual(newVersions, undefined);
    assert.equal(newVersions.size, 2, 'There should be 2 updated version');
    assert.isTrue(newVersions.has('B'), 'Evergreen package "B" was solved');
    assert.equal(newVersions.get('B'), '0.0.2', 'Evergreen package "B" was bumped to 0.0.2');
    assert.isTrue(newVersions.has('C'), 'Evergreen package "C" was solved');
    assert.equal(newVersions.get('C'), '99.0.0', 'Evergreen package "C" was unchanged');
  });

  it('will bump not bump interdependent packages if it causes mismatch', () => {
    const evergreenPackages: Map<string, string> = new Map<string, string>();
    evergreenPackages.set('B', '0.0.1');
    evergreenPackages.set('C', )

    const versioner: EvergreenVersioner = new EvergreenVersioner(
      evergreenPackages,
      convertProjectInfoToMap({
        'A': {
          '1.0.0': {
            B: '0.0.1',
            C: '99.0.0'
          }
        },
        'B': {
          '0.0.1': {},
          '0.0.2': {}
        },
        'C'
      })
    );

    const newVersions: Map<string, string> = versioner.solve(['B']);

    assert.notEqual(newVersions, undefined);
    assert.equal(newVersions.size, 1, 'There should be 1 updated version');
    assert.isTrue(newVersions.has('B'), 'Evergreen package "B" was solved');
    assert.equal(newVersions.get('B'), '0.0.2', 'Evergreen package "B" was bumped to 0.0.2');
  });
  */
});