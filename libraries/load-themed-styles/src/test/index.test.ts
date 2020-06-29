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
    expect(detokenize('"[theme:name, default: #FFF]"')).toEqual('#FFF');
    expect(detokenize('"[theme: name, default: #FFF]"')).toEqual('#FFF');
    expect(detokenize('"[theme: name , default: #FFF  ]"')).toEqual('#FFF');
  });

  it('handles rgba', () => {
    expect(detokenize('"[theme:name, default: rgba(255,255,255,.5)]"')).toEqual('rgba(255,255,255,.5)');
  });

  it('handles fonts', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]"')).toEqual('"Segoe UI"');
  });

  it('respects theme', () => {
    loadTheme({
      color: 'red'
    });

    try {
      expect(detokenize('"[theme:color, default: #FFF]"')).toEqual('red');
      expect(detokenize('"[theme: color , default: #FFF]"')).toEqual('red');
    } finally {
      loadTheme(undefined);
    }
  });

  it('ignores malformed themes', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]')).toEqual('"[theme:name, default: "Segoe UI"]');
    expect(detokenize('"[theme:]"')).toEqual('"[theme:]"');
  });

  it('translates missing themes', () => {
    expect(detokenize('"[theme:name]"')).toEqual('inherit');
  });

  it('splits non-themable CSS', () => {
    const cssString: string = '.sampleClass\n{\n color: #FF0000;\n}\n';
    const arr: IThemingInstruction[] = splitStyles(cssString);
    expect(arr).toHaveLength(1);
    expect(arr[0].rawString).toEqual(cssString);
  });

  it('splits themable CSS', () => {
    const arr: IThemingInstruction[] = splitStyles(
      '.firstClass { color: "[theme: firstColor ]";}\n' +
        ' .secondClass { color: "[theme:secondColor, default: #AAA]";}\n .coach { color: #333; }'
    );
    expect(arr).toHaveLength(5);
    for (let i: number = 0; i < arr.length; i++) {
      if (i % 2 === 0) {
        // even index should be a string component
        expect(typeof arr[i].rawString).toEqual('string');
      } else {
        // odd index should be a theme instruction object
        expect(typeof arr[i].theme).toEqual('string');
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
    expect(subject).toEqual(expected);

    configureLoadStyles(undefined);
  });
});
