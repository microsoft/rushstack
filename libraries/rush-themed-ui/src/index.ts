// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is an internal library for use by Rush Stack apps.
 * It provides a small set of reusable React UI components
 * with a consistent theme.
 *
 * @remarks
 * The implementation is based on the
 * {@link https://www.radix-ui.com/ | Radix UI Primitives} framework.
 *
 * @packageDocumentation
 */

export { Button, type IButtonProps } from './components/Button/index.tsx';
export { ScrollArea, type IScrollAreaProps } from './components/ScrollArea/index.tsx';
export { Tabs, type ITabsItem, type ITabsProps } from './components/Tabs/index.tsx';
export { Checkbox, type ICheckboxProps } from './components/Checkbox/index.tsx';
export { Input, type IInputProps } from './components/Input/index.tsx';
export { Text, type TextType, type ITextProps } from './components/Text/index.tsx';
