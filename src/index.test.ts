import { expect } from 'chai';
import { detokenize, loadTheme } from './index';

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
    } finally {
      loadTheme(null);
    }
  });

  it('ignores malformed themes', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]')).to.equal('"[theme:name, default: "Segoe UI"]');
    expect(detokenize('"[theme:]"')).to.equal('"[theme:]"');
  });

  it('translates missing themes', () => {
    expect(detokenize('"[theme:name]"')).to.equal('inherit');
  });
});
