// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Interface } from 'node:readline';

// Modified from the choice list prompt in inquirer:
// https://github.com/SBoudrias/Inquirer.js/blob/inquirer%407.3.3/packages/inquirer/lib/prompts/list.js
// Extended to include text filtering for the list
import type { default as inquirer, Answers, ListQuestion, DistinctChoice } from 'inquirer';
import BasePrompt from 'inquirer/lib/prompts/base';
import observe from 'inquirer/lib/utils/events';
import Paginator from 'inquirer/lib/utils/paginator';
import type Separator from 'inquirer/lib/objects/separator';
import type Choice from 'inquirer/lib/objects/choice';
import type Choices from 'inquirer/lib/objects/choices';
import figures from 'figures';
import { map, takeUntil } from 'rxjs/operators';

import { Colorize } from '@rushstack/terminal';

interface IKeyPressEvent {
  key: { name: string; ctrl: boolean; sequence?: string };
}

export class SearchListPrompt extends BasePrompt<ListQuestion> {
  protected done!: (result: unknown) => void;

  private readonly _paginator: Paginator;
  private _selected: number = 0;
  private _query: string = '';
  private _firstRender: boolean = true;

  public constructor(question: ListQuestion, readline: Interface, answers: Answers) {
    super(question, readline, answers);

    if (!this.opt.choices) {
      this.throwParamError('choices');
    }

    const isDefaultANumber: boolean = typeof this.opt.default === 'number';
    if (isDefaultANumber && this.opt.default >= 0 && this.opt.default < this.opt.choices.realLength) {
      this._selected = this.opt.default;
    } else if (!isDefaultANumber && this.opt.default !== null) {
      const index: number = this.opt.choices.realChoices.findIndex(({ value }) => value === this.opt.default);
      this._selected = Math.max(index, 0);
    }

    // Make sure no default is set (so it won't be printed)
    this.opt.default = null;

    this._paginator = new Paginator(this.screen);
  }

  protected _run(callback: (result: unknown) => void): this {
    this.done = callback;

    // eslint-disable-next-line @typescript-eslint/typedef
    const events = observe(this.rl);
    // eslint-disable-next-line @typescript-eslint/typedef
    const validation = this.handleSubmitEvents(events.line.pipe(map(this._getCurrentValue.bind(this))));

    void validation.success.forEach(this._onSubmit.bind(this));
    void validation.error.forEach(this._onError.bind(this));

    void events.numberKey
      .pipe(takeUntil(events.line))
      .forEach(this._onNumberKey.bind(this) as (evt: unknown) => void);

    void events.keypress
      .pipe(takeUntil(validation.success))
      .forEach(this._onKeyPress.bind(this) as (evt: unknown) => void);

    this.render();
    return this;
  }

  private _onUpKey(): void {
    return this._adjustSelected(-1);
  }

  private _onDownKey(): void {
    return this._adjustSelected(1);
  }

  private _onNumberKey(input: number): void {
    if (input <= this.opt.choices.realLength) {
      this._selected = input - 1;
    }

    this.render();
  }

  /**
   * When user press `enter` key
   */
  private _onSubmit(state: { value: unknown }): void {
    this.status = 'answered';
    // Rerender prompt (and clean subline error)
    this.render();

    this.screen.done();
    this.done(state.value);
  }

  private _onError(state: inquirer.prompts.FailedPromptStateData): void {
    this.render(state.isValid || undefined);
  }

  private _onKeyPress(event: IKeyPressEvent): void {
    if (event.key.ctrl) {
      switch (event.key.name) {
        case 'backspace':
          return this._setQuery('');
      }
    } else {
      switch (event.key.name) {
        // Go to beginning of list
        case 'home':
          return this._adjustSelected(-Infinity);
        // Got to end of list
        case 'end':
          return this._adjustSelected(Infinity);
        // Paginate up
        case 'pageup':
          return this._adjustSelected(-(this.opt.pageSize ?? 1));
        // Paginate down
        case 'pagedown':
          return this._adjustSelected(this.opt.pageSize ?? 1);

        case 'backspace':
          return this._setQuery(this._query.slice(0, -1));
        case 'up':
          return this._onUpKey();
        case 'down':
          return this._onDownKey();

        default:
          if (event.key.sequence && event.key.sequence.length === 1) {
            this._setQuery(this._query + event.key.sequence);
          }
      }
    }
  }

  private _setQuery(query: string): void {
    this._query = query;
    const filter: string = query.toUpperCase();

    const { choices } = this.opt.choices;
    for (const choice of choices as Iterable<{ disabled?: boolean; type: string; short: string }>) {
      if (choice.type !== 'separator') {
        choice.disabled = !choice.short.toUpperCase().includes(filter);
      }
    }

    // Select the first valid option
    this._adjustSelected(0);
  }

  // Provide the delta in deplayed choices and change the selected
  // index accordingly by the delta in real choices
  private _adjustSelected(delta: number): void {
    const { choices } = this.opt.choices;
    const pointer: number = this._selected;
    let lastValidIndex: number = pointer;

    // if delta is less than 0, we are moving up in list w/ selected index
    if (delta < 0) {
      for (let i: number = pointer - 1; i >= 0; i--) {
        const choice: Choice<Answers> = choices[i] as Choice<Answers>;
        if (isValidChoice(choice)) {
          ++delta;
          lastValidIndex = i;
          // if delta is 0, we have found the next valid choice that has an index less than the selected index
          if (delta === 0) {
            break;
          }
        }
      }
    } else {
      // if delta is greater than 0, we are moving down in list w/ selected index
      // Also, if delta is exactly 0, the request is to adjust to the first
      // displayed choice that has an index >= the current selected choice.
      ++delta;
      for (let i: number = pointer, len: number = choices.length; i < len; i++) {
        const choice: Choice<Answers> = choices[i] as Choice<Answers>;
        if (isValidChoice(choice)) {
          --delta;
          lastValidIndex = i;
          // if delta is 0, we have found the next valid choice that has an index greater than the selected index
          if (delta === 0) {
            break;
          }
        }
      }
    }

    this._selected = lastValidIndex;
    this.render();
  }

  private _getCurrentValue(): string {
    return this.opt.choices.getChoice(this._selected).value;
  }

  public render(error?: string): void {
    // Render the question
    let message: string = this.getQuestion();
    let bottomContent: string = '';

    if (this._firstRender) {
      message += Colorize.dim(' (Use arrow keys)');
    }

    // Render choices or answer depending on the state
    if (this.status === 'answered') {
      message += Colorize.cyan(this.opt.choices.getChoice(this._selected).short!);
    } else {
      const choicesStr: string = listRender(this.opt.choices, this._selected);
      const indexPosition: number = this.opt.choices.indexOf(
        this.opt.choices.getChoice(this._selected) as Choice<Answers>
      );
      let realIndexPosition: number = 0;
      const { choices } = this.opt.choices;

      for (let i: number = 0; i < indexPosition; i++) {
        const value: DistinctChoice<Answers> = choices[i];

        // Add line if it's a separator
        if (value.type === 'separator') {
          realIndexPosition++;
          continue;
        }

        // Do not render choices which disabled property
        // these represent choices that are filtered out
        if ((value as { disabled?: unknown }).disabled) {
          continue;
        }

        const line: string | undefined = value.name;
        // Non-strings take up one line
        if (typeof line !== 'string') {
          realIndexPosition++;
          continue;
        }

        // Calculate lines taken up by string
        // eslint-disable-next-line no-bitwise
        realIndexPosition += ((line.length / process.stdout.columns!) | 0) + 1;
      }
      message += `\n${Colorize.white(Colorize.bold('Start typing to filter:'))} ${Colorize.cyan(
        this._query
      )}`;
      // @ts-expect-error Types are wrong
      message += '\n' + this._paginator.paginate(choicesStr, realIndexPosition, this.opt.pageSize!);
    }

    if (error) {
      bottomContent = Colorize.red('>> ') + error;
    }

    this.screen.render(message, bottomContent);
  }
}

function listRender(choices: Choices, pointer: number): string {
  let output: string = '';

  choices.forEach((choice: Separator | Choice<Answers>, i: number) => {
    if (choice.type === 'separator') {
      output += ' ' + choice + '\n';
      return;
    }

    if (!choice.disabled) {
      const line: string = choice.name;
      if (i === pointer) {
        output += Colorize.cyan(figures.pointer + line);
      } else {
        output += ' ' + line;
      }
    }

    if (i < choices.length - 1) {
      output += '\n';
    }
  });

  return output.replace(/\n$/, '');
}

function isValidChoice(choice: Choice<Answers>): boolean {
  return !choice.disabled;
}
