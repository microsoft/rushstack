// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createBase32Hash, depPathToFilename, getDescriptionFileRootFromKey } from '../helpers.ts';

describe(createBase32Hash.name, () => {
  it('hashes', () => {
    for (const input of ['a', 'abracadabra', '(eslint@8.57.0)(typescript@5.4.5)']) {
      expect(createBase32Hash(input)).toMatchSnapshot(input);
    }
  });
});

describe(depPathToFilename.name, () => {
  it('formats', () => {
    for (const input of [
      '/autoprefixer@9.8.8',
      '/autoprefixer@10.4.18(postcss@8.4.36)',
      '/react-transition-group@4.4.5(react-dom@17.0.2)(react@17.0.2)',
      '/@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)(@fluentui/merge-styles@8.6.2)(@fluentui/react@8.117.5)(@fluentui/theme@2.6.45)(@fluentui/utilities@8.15.2)(chart.js@2.9.4)(lodash@4.17.21)(moment@2.29.4)(prop-types@15.8.1)(react-dnd-html5-backend@14.1.0)(react-dnd@14.0.5)(react-dom@17.0.1)(react-intersection-observer@8.34.0)(react@17.0.1)',
      '/@storybook/core@6.5.15(@storybook/builder-webpack5@6.5.15)(@storybook/manager-webpack5@6.5.15)(eslint@8.57.0)(react-dom@17.0.1)(react@17.0.1)(typescript@5.3.3)(webpack@5.88.1)',
      '/@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)',
      'file:../../../rigs/local-node-rig',
      'file:../../../libraries/ts-command-line(@types/node@18.17.15)'
    ]) {
      expect(depPathToFilename(input)).toMatchSnapshot(input);
    }
  });
});

describe(getDescriptionFileRootFromKey.name, () => {
  it('parses', () => {
    const lockfileRoot: string = '/$';
    for (const { key, name } of [
      { key: '/autoprefixer@9.8.8' },
      { key: '/autoprefixer@10.4.18(postcss@8.4.36)' },
      { key: '/react-transition-group@4.4.5(react-dom@17.0.2)(react@17.0.2)' },
      {
        key: '/@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)(@fluentui/merge-styles@8.6.2)(@fluentui/react@8.117.5)(@fluentui/theme@2.6.45)(@fluentui/utilities@8.15.2)(chart.js@2.9.4)(lodash@4.17.21)(moment@2.29.4)(prop-types@15.8.1)(react-dnd-html5-backend@14.1.0)(react-dnd@14.0.5)(react-dom@17.0.1)(react-intersection-observer@8.34.0)(react@17.0.1)'
      },
      {
        key: '/@storybook/core@6.5.15(@storybook/builder-webpack5@6.5.15)(@storybook/manager-webpack5@6.5.15)(eslint@8.57.0)(react-dom@17.0.1)(react@17.0.1)(typescript@5.3.3)(webpack@5.88.1)'
      },
      { key: '/@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)' },
      { key: 'file:../../../rigs/local-node-rig', name: 'local-node-rig' },
      {
        key: 'file:../../../libraries/ts-command-line(@types/node@18.17.15)',
        name: '@rushstack/ts-command-line'
      }
    ]) {
      expect(getDescriptionFileRootFromKey(lockfileRoot, key, name)).toMatchSnapshot(`"${key}",${name}`);
    }
  });
});
