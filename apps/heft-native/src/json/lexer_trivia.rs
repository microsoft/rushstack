use super::cursor::{JsonCursor, JsonScanResult, JsonTextNeedsJavaScriptParser};
use crate::simd::{
    position_after_json_whitespace, position_of_block_comment_star,
    position_of_line_comment_end_or_separator_lead_byte,
};

impl JsonCursor<'_> {
    pub(super) fn skip_whitespace_and_comments(&mut self) -> JsonScanResult<()> {
        loop {
            match self.peek_byte() {
                Some(b' ' | b'\t' | b'\n' | b'\r') => {
                    self.position += 1;
                    if let Some(b' ' | b'\t' | b'\n' | b'\r') = self.peek_byte() {
                        self.position =
                            position_after_json_whitespace(self.bytes, self.position + 1);
                    }
                }
                Some(b'/') => {
                    self.refuse_unless_comments_and_trailing_commas_are_allowed()?;
                    match self.peek_byte_after(1) {
                        Some(b'/') => self.skip_line_comment()?,
                        Some(b'*') => self.skip_block_comment()?,
                        _ => return Err(JsonTextNeedsJavaScriptParser),
                    }
                }
                _ => return Ok(()),
            }
        }
    }

    fn skip_line_comment(&mut self) -> JsonScanResult<()> {
        self.position += 2;
        loop {
            self.position =
                position_of_line_comment_end_or_separator_lead_byte(self.bytes, self.position);
            match self.peek_byte() {
                None | Some(b'\n' | b'\r') => return Ok(()),
                Some(_) if self.is_at_line_or_paragraph_separator() => {
                    return Err(JsonTextNeedsJavaScriptParser)
                }
                Some(_) => self.position += 1,
            }
        }
    }

    fn skip_block_comment(&mut self) -> JsonScanResult<()> {
        self.position += 2;
        loop {
            self.position = position_of_block_comment_star(self.bytes, self.position);
            match self.peek_byte() {
                None => return Err(JsonTextNeedsJavaScriptParser),
                Some(_) if self.peek_byte_after(1) == Some(b'/') => {
                    self.position += 2;
                    return Ok(());
                }
                Some(_) => self.position += 1,
            }
        }
    }
}
