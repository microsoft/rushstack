use std::borrow::Cow;

use super::cursor::{JsonCursor, JsonScanResult, JsonTextNeedsJavaScriptParser};

const FIRST_HIGH_SURROGATE: u32 = 0xd800;
const FIRST_LOW_SURROGATE: u32 = 0xdc00;
const END_OF_SURROGATES: u32 = 0xe000;

impl<'text> JsonCursor<'text> {
    pub(super) fn read_string_literal(&mut self) -> JsonScanResult<Cow<'text, str>> {
        self.position += 1;
        let content_start = self.position;
        loop {
            match self.next_byte_or_refuse()? {
                b'"' => {
                    let content = &self.text[content_start..self.position];
                    self.position += 1;
                    return Ok(Cow::Borrowed(content));
                }
                b'\\' => {
                    return self
                        .read_string_literal_with_escapes(content_start)
                        .map(Cow::Owned)
                }
                0x00..=0x1f => return Err(JsonTextNeedsJavaScriptParser),
                0xe2 if self.is_at_line_or_paragraph_separator() => {
                    return Err(JsonTextNeedsJavaScriptParser)
                }
                _ => self.position += 1,
            }
        }
    }

    fn read_string_literal_with_escapes(&mut self, content_start: usize) -> JsonScanResult<String> {
        let mut decoded = String::with_capacity(self.position - content_start + 16);
        decoded.push_str(&self.text[content_start..self.position]);
        loop {
            match self.next_byte_or_refuse()? {
                b'"' => {
                    self.position += 1;
                    return Ok(decoded);
                }
                b'\\' => {
                    self.position += 1;
                    self.decode_escape_sequence_into(&mut decoded)?;
                }
                0x00..=0x1f => return Err(JsonTextNeedsJavaScriptParser),
                0xe2 if self.is_at_line_or_paragraph_separator() => {
                    return Err(JsonTextNeedsJavaScriptParser)
                }
                _ => self.copy_run_of_ordinary_string_bytes_into(&mut decoded),
            }
        }
    }

    fn copy_run_of_ordinary_string_bytes_into(&mut self, decoded: &mut String) {
        let run_start = self.position;
        self.position += 1;
        while let Some(byte) = self.peek_byte() {
            if byte == b'"' || byte == b'\\' || byte < 0x20 || byte == 0xe2 {
                break;
            }
            self.position += 1;
        }
        decoded.push_str(&self.text[run_start..self.position]);
    }

    fn decode_escape_sequence_into(&mut self, decoded: &mut String) -> JsonScanResult<()> {
        let escape = self.next_byte_or_refuse()?;
        self.position += 1;
        let character = match escape {
            b'"' => '"',
            b'\\' => '\\',
            b'/' => '/',
            b'b' => '\u{8}',
            b'f' => '\u{c}',
            b'n' => '\n',
            b'r' => '\r',
            b't' => '\t',
            b'u' => self.decode_unicode_escape_after_u()?,
            _ => return Err(JsonTextNeedsJavaScriptParser),
        };
        decoded.push(character);
        Ok(())
    }

    fn decode_unicode_escape_after_u(&mut self) -> JsonScanResult<char> {
        let code_unit = self.read_four_hex_digits()?;
        let code_point = if (FIRST_HIGH_SURROGATE..FIRST_LOW_SURROGATE).contains(&code_unit) {
            if self.peek_byte() != Some(b'\\') || self.peek_byte_after(1) != Some(b'u') {
                return Err(JsonTextNeedsJavaScriptParser);
            }
            self.position += 2;
            let low_code_unit = self.read_four_hex_digits()?;
            if !(FIRST_LOW_SURROGATE..END_OF_SURROGATES).contains(&low_code_unit) {
                return Err(JsonTextNeedsJavaScriptParser);
            }
            0x10000
                + ((code_unit - FIRST_HIGH_SURROGATE) << 10)
                + (low_code_unit - FIRST_LOW_SURROGATE)
        } else if (FIRST_LOW_SURROGATE..END_OF_SURROGATES).contains(&code_unit) {
            return Err(JsonTextNeedsJavaScriptParser);
        } else {
            code_unit
        };
        char::from_u32(code_point).ok_or(JsonTextNeedsJavaScriptParser)
    }

    fn read_four_hex_digits(&mut self) -> JsonScanResult<u32> {
        let digits = self
            .bytes
            .get(self.position..self.position + 4)
            .ok_or(JsonTextNeedsJavaScriptParser)?;
        let mut code_unit: u32 = 0;
        for &digit in digits {
            let digit_value = (digit as char)
                .to_digit(16)
                .ok_or(JsonTextNeedsJavaScriptParser)?;
            code_unit = code_unit * 16 + digit_value;
        }
        self.position += 4;
        Ok(code_unit)
    }
}
