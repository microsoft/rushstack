// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Modified from the choice list prompt in inquirer:
// https://github.com/SBoudrias/Inquirer.js/blob/inquirer%407.3.3/packages/inquirer/lib/prompts/list.js
// Extended to include text filtering for the list
import figures from 'figures';

import { AnsiEscape, Colorize } from '@rushstack/terminal';

export interface ISearchListChoice<Value = unknown> {
  name: string;
  value: Value;
  /**
   * Optional text used for filtering. Defaults to `name` with ANSI codes removed.
   */
  short?: string;
}

export interface ISearchListConfig<Value = unknown> {
  message: string;
  choices: ReadonlyArray<ISearchListChoice<Value>>;
  pageSize?: number;
}

interface INormalizedChoice<Value> {
  name: string;
  value: Value;
  /** ANSI-stripped text used for filtering */
  filterText: string;
}

/**
 * A searchable list prompt that allows the user to filter choices by typing.
 */
export async function searchListPrompt<Value>(config: ISearchListConfig<Value>): Promise<Value> {
  const {
    createPrompt,
    useState,
    useMemo,
    useKeypress,
    usePrefix,
    usePagination,
    isEnterKey,
    isUpKey,
    isDownKey
  } = await import('@inquirer/core');

  const impl: (config: ISearchListConfig<unknown>) => Promise<unknown> =
    createPrompt<unknown, ISearchListConfig<unknown>>((promptConfig, done) => {
      const pageSize: number = promptConfig.pageSize ?? 12;

      const [status, setStatus] = useState<'idle' | 'done'>('idle');
      const [query, setQuery] = useState('');
      const [active, setActive] = useState(0);

      // Normalize choices once (strip ANSI codes for filtering)
      const normalizedChoices: INormalizedChoice<unknown>[] = useMemo(
        () =>
          promptConfig.choices.map((choice) => ({
            name: choice.name,
            value: choice.value,
            filterText: choice.short ?? AnsiEscape.removeCodes(choice.name)
          })),
        [promptConfig.choices]
      );

      // Filter the normalized choices based on the current query
      const visibleChoices: INormalizedChoice<unknown>[] = useMemo(() => {
        if (!query) {
          return normalizedChoices;
        }
        const filter: string = query.toUpperCase();
        return normalizedChoices.filter((choice) => choice.filterText.toUpperCase().includes(filter));
      }, [normalizedChoices, query]);

      // Clamp active index to the valid range of visible choices
      const safeActive: number = Math.min(active, Math.max(0, visibleChoices.length - 1));
      const selectedChoice: INormalizedChoice<unknown> | undefined = visibleChoices[safeActive];

      useKeypress((key, rl) => {
        if (isEnterKey(key)) {
          if (selectedChoice !== undefined) {
            setStatus('done');
            done(selectedChoice.value);
          }
          return;
        }

        if (isUpKey(key)) {
          rl.clearLine(0);
          setActive(Math.max(0, safeActive - 1));
          return;
        }

        if (isDownKey(key)) {
          rl.clearLine(0);
          setActive(Math.min(visibleChoices.length - 1, safeActive + 1));
          return;
        }

        switch (key.name) {
          // Go to beginning of list
          case 'home':
            rl.clearLine(0);
            setActive(0);
            return;
          // Go to end of list
          case 'end':
            rl.clearLine(0);
            setActive(Math.max(0, visibleChoices.length - 1));
            return;
          // Paginate up
          case 'pageup':
            rl.clearLine(0);
            setActive(Math.max(0, safeActive - pageSize));
            return;
          // Paginate down
          case 'pagedown':
            rl.clearLine(0);
            setActive(Math.min(visibleChoices.length - 1, safeActive + pageSize));
            return;
          case 'backspace':
            if (key.ctrl) {
              // Ctrl+Backspace: clear the entire filter query
              rl.clearLine(0);
              setQuery('');
              setActive(0);
              return;
            }
            break;
        }

        // For all other keys (character input, backspace, etc.), read from the
        // readline line buffer which handles editing, and reset to the first match.
        setQuery(rl.line);
        setActive(0);
      });

      const prefix: string = usePrefix({ status });

      const page: string = usePagination({
        items: visibleChoices,
        active: safeActive,
        renderItem: ({
          item,
          isActive
        }: {
          item: INormalizedChoice<unknown>;
          index: number;
          isActive: boolean;
        }) => (isActive ? Colorize.cyan(figures.pointer + item.name) : ` ${item.name}`),
        pageSize,
        loop: false
      });

      if (status === 'done') {
        return `${prefix} ${promptConfig.message} ${Colorize.cyan(selectedChoice?.filterText ?? '')}`;
      }

      return [
        `${prefix} ${promptConfig.message}\n${Colorize.white(Colorize.bold('Start typing to filter:'))} ${Colorize.cyan(query)}`,
        page
      ];
    });

  return impl(config as ISearchListConfig<unknown>) as Promise<Value>;
}
