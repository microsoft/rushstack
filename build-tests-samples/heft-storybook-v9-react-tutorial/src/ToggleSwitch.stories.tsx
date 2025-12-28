// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Meta, StoryObj } from 'heft-storybook-v9-react-tutorial-storykit';

import { ToggleSwitch } from './ToggleSwitch';

export default {
  title: 'Octogonz/ToggleSwitch',
  component: ToggleSwitch,
  argTypes: {
    leftColor: { control: 'color' },
    rightColor: { control: 'color' }
  }
} as Meta<typeof ToggleSwitch>;

export const Primary: StoryObj<typeof ToggleSwitch> = {
  args: {
    leftColor: '#880000',
    rightColor: '#008000'
  }
};

export const Secondary: StoryObj<typeof ToggleSwitch> = {
  args: {}
};
