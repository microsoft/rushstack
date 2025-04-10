# @rushstack/heft-sass-load-themed-styles-plugin

This is a Heft plugin to augment SASS processing with functionality to replace load-themed-styles theme expressions of the form
```
[theme:<tokenName>, default:<default>]
```
e.g.
```
[theme:someColor, default:#fc0]
```

With css variable references of the form:
```css
var(--<tokenName>, <default>)
```
e.g.
```css
var(--someColor, #fc0>)
```


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-sass-load-themed-styles-plugin/CHANGELOG.md) - Find
  out what's new in the latest version

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
