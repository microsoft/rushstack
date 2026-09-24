pub struct BuildInfoJson {
    pub configuration_hash: String,
    pub input_file_versions: Vec<(String, String)>,
}

pub fn parse_build_info_json(text: &str) -> Option<BuildInfoJson> {
    let mut reader = StrictJsonReader { bytes: text.as_bytes(), position: 0 };
    let mut configuration_hash = None;
    let mut input_file_versions = None;
    reader.expect_byte(b'{')?;
    loop {
        let key = reader.read_string()?;
        reader.expect_byte(b':')?;
        match key.as_str() {
            "configHash" if configuration_hash.is_none() => configuration_hash = Some(reader.read_string()?),
            "inputFileVersions" if input_file_versions.is_none() => input_file_versions = Some(reader.read_string_map()?),
            _ => return None,
        }
        if !reader.read_separator_or_end(b'}')? {
            break;
        }
    }
    reader.skip_whitespace();
    if reader.position != reader.bytes.len() {
        return None;
    }
    Some(BuildInfoJson {
        configuration_hash: configuration_hash?,
        input_file_versions: input_file_versions?,
    })
}

pub fn is_array_index_key(key: &str) -> bool {
    !key.is_empty()
        && key.bytes().all(|byte| byte.is_ascii_digit())
        && (key == "0" || !key.starts_with('0'))
        && key.parse::<u64>().is_ok_and(|index| index < u32::MAX as u64)
}

struct StrictJsonReader<'text> {
    bytes: &'text [u8],
    position: usize,
}

impl StrictJsonReader<'_> {
    fn skip_whitespace(&mut self) {
        while let Some(b' ' | b'\t' | b'\n' | b'\r') = self.bytes.get(self.position) {
            self.position += 1;
        }
    }

    fn expect_byte(&mut self, expected: u8) -> Option<()> {
        self.skip_whitespace();
        (self.bytes.get(self.position) == Some(&expected)).then(|| self.position += 1)
    }

    fn read_separator_or_end(&mut self, end: u8) -> Option<bool> {
        self.skip_whitespace();
        let byte = *self.bytes.get(self.position)?;
        self.position += 1;
        match byte {
            b',' => Some(true),
            _ if byte == end => Some(false),
            _ => None,
        }
    }

    fn read_string_map(&mut self) -> Option<Vec<(String, String)>> {
        self.expect_byte(b'{')?;
        let mut entries: Vec<(String, String)> = Vec::new();
        let mut seen_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
        self.skip_whitespace();
        if self.bytes.get(self.position) == Some(&b'}') {
            self.position += 1;
            return Some(entries);
        }
        loop {
            let key = self.read_string()?;
            self.expect_byte(b':')?;
            let value = self.read_string()?;
            if is_array_index_key(&key) || !seen_keys.insert(key.clone()) {
                return None;
            }
            entries.push((key, value));
            if !self.read_separator_or_end(b'}')? {
                return Some(entries);
            }
        }
    }

    fn read_string(&mut self) -> Option<String> {
        self.expect_byte(b'"')?;
        let mut value = String::new();
        loop {
            let start = self.position;
            while let Some(&byte) = self.bytes.get(self.position) {
                if byte == b'"' || byte == b'\\' || byte < 0x20 {
                    break;
                }
                self.position += 1;
            }
            value.push_str(std::str::from_utf8(&self.bytes[start..self.position]).ok()?);
            let byte = *self.bytes.get(self.position)?;
            self.position += 1;
            match byte {
                b'"' => return Some(value),
                b'\\' => value.push(self.read_escape()?),
                _ => return None,
            }
        }
    }

    fn read_escape(&mut self) -> Option<char> {
        let byte = *self.bytes.get(self.position)?;
        self.position += 1;
        match byte {
            b'"' => Some('"'),
            b'\\' => Some('\\'),
            b'/' => Some('/'),
            b'b' => Some('\u{8}'),
            b'f' => Some('\u{c}'),
            b'n' => Some('\n'),
            b'r' => Some('\r'),
            b't' => Some('\t'),
            b'u' => {
                let first = self.read_hex_code_unit()?;
                if !(0xd800..0xdc00).contains(&first) {
                    return char::from_u32(first);
                }
                if self.bytes.get(self.position..self.position + 2) != Some(b"\\u") {
                    return None;
                }
                self.position += 2;
                let second = self.read_hex_code_unit()?;
                if !(0xdc00..0xe000).contains(&second) {
                    return None;
                }
                char::from_u32(0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00))
            }
            _ => None,
        }
    }

    fn read_hex_code_unit(&mut self) -> Option<u32> {
        let digits = std::str::from_utf8(self.bytes.get(self.position..self.position + 4)?).ok()?;
        self.position += 4;
        if !digits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        u32::from_str_radix(digits, 16).ok()
    }
}
