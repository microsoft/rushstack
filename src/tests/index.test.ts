/// <reference types="mocha" />

import { expect } from 'chai';
import {
  detokenize,
  loadTheme,
  splitStyles,
  loadStyles,
  configureLoadStyles,
  IThemingInstruction
} from './../index';

describe('detokenize', () => {
  it('handles colors', () => {
    expect(detokenize('"[theme:name, default: #FFF]"')).to.equal('#FFF');
    expect(detokenize('"[theme: name, default: #FFF]"')).to.equal('#FFF');
    expect(detokenize('"[theme: name , default: #FFF  ]"')).to.equal('#FFF');
  });

  it('handles rgba', () => {
    expect(detokenize('"[theme:name, default: rgba(255,255,255,.5)]"')).to.equal('rgba(255,255,255,.5)');
  });

  it('handles fonts', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]"')).to.equal('"Segoe UI"');
  });

  it('respects theme', () => {
    loadTheme({
      color: 'red'
    });

    try {
      expect(detokenize('"[theme:color, default: #FFF]"')).to.equal('red');
      expect(detokenize('"[theme: color , default: #FFF]"')).to.equal('red');
    } finally {
      loadTheme(undefined);
    }
  });

  it('ignores malformed themes', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]')).to.equal('"[theme:name, default: "Segoe UI"]');
    expect(detokenize('"[theme:]"')).to.equal('"[theme:]"');
  });

  it('translates missing themes', () => {
    expect(detokenize('"[theme:name]"')).to.equal('inherit');
  });

  it('splits non-themable CSS', () => {
      const cssString: string = '.sampleClass\n{\n color: #FF0000;\n}\n';
      const arr: IThemingInstruction[] = splitStyles(cssString);
      expect(arr.length).to.equal(1);
      expect(arr[0].rawString).to.equal(cssString);
  });

  it('splits themable CSS', () => {
      const arr: IThemingInstruction[] = splitStyles('.firstClass { color: "[theme: firstColor ]";}\n' +
          ' .secondClass { color: "[theme:secondColor, default: #AAA]";}\n .coach { color: #333; }');
      expect(arr.length).to.equal(5);
      for (let i: number = 0; i < arr.length; i++) {
          if (i % 2 === 0) { // even index should be a string component
              expect(typeof arr[i].rawString).to.equal('string');
          } else { // odd index should be a theme instruction object
              expect(typeof arr[i].theme).to.equal('string');
          }
      }
  });

  it('passes the styles to loadStyles override callback', () => {
    const expected: string = 'xxx.foo { color: #FFF }xxx';
    let subject: string | undefined = undefined;

    const callback: (str: string) => void = (str: string) => {
      subject = 'xxx' + str + 'xxx';
    };

    configureLoadStyles(callback);

    loadStyles('.foo { color: "[theme:fooColor, default: #FFF]" }');
    expect(subject).to.equal(expected);

    configureLoadStyles(undefined);
  });
});
