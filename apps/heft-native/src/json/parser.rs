use super::cursor::{JsonCursor, JsonScanResult, JsonTextNeedsJavaScriptParser};
use super::duplicate_key_index::DuplicateKeyIndex;
use super::value::{JsonObject, JsonValue};

pub fn parse_json_with_comments_exactly_like_jju(
    text: &str,
) -> Result<JsonValue<'_>, JsonTextNeedsJavaScriptParser> {
    parse_json_with_cursor(JsonCursor::new(text, true))
}

pub fn parse_json_exactly_like_json_parse(
    text: &str,
) -> Result<JsonValue<'_>, JsonTextNeedsJavaScriptParser> {
    parse_json_with_cursor(JsonCursor::new(text, false))
}

fn parse_json_with_cursor(
    cursor: JsonCursor<'_>,
) -> Result<JsonValue<'_>, JsonTextNeedsJavaScriptParser> {
    let mut cursor = cursor;
    cursor.skip_whitespace_and_comments()?;
    let value = cursor.read_value()?;
    cursor.skip_whitespace_and_comments()?;
    if !cursor.is_at_end() {
        return Err(JsonTextNeedsJavaScriptParser);
    }
    Ok(value)
}

impl<'text> JsonCursor<'text> {
    fn read_value(&mut self) -> JsonScanResult<JsonValue<'text>> {
        match self.next_byte_or_refuse()? {
            b'{' => self.read_object(),
            b'[' => self.read_array(),
            b'"' => Ok(JsonValue::String(self.read_string_literal()?)),
            b't' => self.read_keyword(b"true", JsonValue::Boolean(true)),
            b'f' => self.read_keyword(b"false", JsonValue::Boolean(false)),
            b'n' => self.read_keyword(b"null", JsonValue::Null),
            b'-' | b'0'..=b'9' => Ok(JsonValue::Number(self.read_number_literal()?)),
            _ => Err(JsonTextNeedsJavaScriptParser),
        }
    }

    fn read_keyword(
        &mut self,
        keyword: &[u8],
        value: JsonValue<'text>,
    ) -> JsonScanResult<JsonValue<'text>> {
        if !self.bytes[self.position..].starts_with(keyword) {
            return Err(JsonTextNeedsJavaScriptParser);
        }
        self.position += keyword.len();
        if let Some(following) = self.peek_byte() {
            if following.is_ascii_alphanumeric()
                || matches!(following, b'_' | b'$' | b'\\')
                || following >= 0x80
            {
                return Err(JsonTextNeedsJavaScriptParser);
            }
        }
        Ok(value)
    }

    fn read_array(&mut self) -> JsonScanResult<JsonValue<'text>> {
        self.enter_nested_value()?;
        self.position += 1;
        self.skip_whitespace_and_comments()?;
        let first_pending_item = self.pending_array_items.len();
        let mut is_first_item = true;
        loop {
            self.skip_whitespace_and_comments()?;
            if self.next_byte_or_refuse()? == b']' {
                if !is_first_item {
                    self.refuse_unless_comments_and_trailing_commas_are_allowed()?;
                }
                self.position += 1;
                break;
            }
            is_first_item = false;
            let item = self.read_value()?;
            self.pending_array_items.push(item);
            self.skip_whitespace_and_comments()?;
            match self.next_byte_or_refuse()? {
                b',' => self.position += 1,
                b']' => {
                    self.position += 1;
                    break;
                }
                _ => return Err(JsonTextNeedsJavaScriptParser),
            }
            self.skip_whitespace_and_comments()?;
            if self.next_byte_or_refuse()? == b',' {
                return Err(JsonTextNeedsJavaScriptParser);
            }
        }
        self.leave_nested_value();
        let items: Vec<JsonValue<'text>> = self
            .pending_array_items
            .drain(first_pending_item..)
            .collect();
        Ok(JsonValue::Array(items))
    }

    fn read_object(&mut self) -> JsonScanResult<JsonValue<'text>> {
        self.enter_nested_value()?;
        self.position += 1;
        self.skip_whitespace_and_comments()?;
        let first_pending_entry = self.pending_object_entries.len();
        let mut duplicate_key_index = DuplicateKeyIndex::new();
        let mut is_first_entry = true;
        loop {
            self.skip_whitespace_and_comments()?;
            match self.next_byte_or_refuse()? {
                b'}' => {
                    if !is_first_entry {
                        self.refuse_unless_comments_and_trailing_commas_are_allowed()?;
                    }
                    self.position += 1;
                    break;
                }
                b'"' => is_first_entry = false,
                _ => return Err(JsonTextNeedsJavaScriptParser),
            }
            let key = self.read_string_literal()?;
            self.skip_whitespace_and_comments()?;
            if self.next_byte_or_refuse()? != b':' {
                return Err(JsonTextNeedsJavaScriptParser);
            }
            self.position += 1;
            self.skip_whitespace_and_comments()?;
            let value = self.read_value()?;
            duplicate_key_index.insert_keeping_first_position(
                &mut self.pending_object_entries,
                first_pending_entry,
                key,
                value,
            );
            self.skip_whitespace_and_comments()?;
            match self.next_byte_or_refuse()? {
                b',' => self.position += 1,
                b'}' => {
                    self.position += 1;
                    break;
                }
                _ => return Err(JsonTextNeedsJavaScriptParser),
            }
        }
        self.leave_nested_value();
        let entries = self
            .pending_object_entries
            .drain(first_pending_entry..)
            .collect();
        Ok(JsonValue::Object(JsonObject { entries }))
    }
}
