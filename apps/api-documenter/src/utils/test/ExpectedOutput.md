# Test page

## Simple bold test

This is a **bold** word.

## All whitespace bold



## Newline bold

**line 1 line 2**

## Newline bold with spaces

 **line 1 line 2 line 3**

## Adjacent bold regions

**onetwo threefour**<!-- -->non-bold<!-- -->**five**

## Adjacent to other characters

[a link](./index.md)<!-- -->**bold**<!-- -->non-boldmore-non-bold

## Bad characters

**\*one\*two\*three\*four**

## Characters that should be escaped

Double-encoded JSON: "{ \\"A\\": 123}"

HTML chars: &lt;script&gt;alert("\[You\] are \#1!");&lt;/script&gt;

HTML escape: &amp;quot;

3 or more hyphens: - -- \-\-\- \-\-\-- \-\-\--- \-\-\-\-\-\-

<b>bold</b>
