use super::base64::append_standard_base64;
use super::sha256::Sha256;

fn digest_hex_for_chunks(bytes: &[u8], chunks: &[usize]) -> String {
    let mut hasher = Sha256::new();
    let mut start = 0;
    for chunk_len in chunks {
        if start >= bytes.len() {
            break;
        }
        let end = (start + *chunk_len).min(bytes.len());
        hasher.update(&bytes[start..end]);
        start = end;
    }
    if start < bytes.len() {
        hasher.update(&bytes[start..]);
    }
    bytes_to_lower_hex(&hasher.finalize())
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        write!(&mut output, "{byte:02x}").unwrap();
    }
    output
}

fn next_xorshift64(value: &mut u64) -> u64 {
    *value ^= *value << 13;
    *value ^= *value >> 7;
    *value ^= *value << 17;
    *value
}

fn deterministic_buffer(len: usize, seed: &mut u64) -> Vec<u8> {
    let mut buffer = Vec::with_capacity(len);
    while buffer.len() < len {
        let random_word = next_xorshift64(seed).to_le_bytes();
        let remaining_len = len - buffer.len();
        buffer.extend_from_slice(&random_word[..remaining_len.min(random_word.len())]);
    }
    buffer
}

fn hash_bytes_with_random_chunks(bytes: &[u8], seed: &mut u64) -> [u8; 32] {
    let mut hasher = Sha256::new();
    let mut offset = 0;
    while offset < bytes.len() {
        let chunk_len = (next_xorshift64(seed) as usize % 211) + 1;
        let end = (offset + chunk_len).min(bytes.len());
        hasher.update(&bytes[offset..end]);
        offset = end;
    }
    hasher.finalize()
}

#[test]
fn sha256_nist_vectors_match_expected_hex() {
    assert_eq!(
        digest_hex_for_chunks(b"", &[1, 2, 3]),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert_eq!(
        digest_hex_for_chunks(b"abc", &[1, 1, 1]),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let long_vector = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    assert_eq!(
        digest_hex_for_chunks(long_vector, &[7, 13, 3, 29, 11]),
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
    let million_a = vec![b'a'; 1_000_000];
    assert_eq!(
        digest_hex_for_chunks(&million_a, &[17, 1024, 3, 65537, 91]),
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
    );
}

#[test]
fn base64_rfc_4648_section_10_cases_match() {
    let cases = [
        (b"".as_slice(), ""),
        (b"f".as_slice(), "Zg=="),
        (b"fo".as_slice(), "Zm8="),
        (b"foo".as_slice(), "Zm9v"),
        (b"foob".as_slice(), "Zm9vYg=="),
        (b"fooba".as_slice(), "Zm9vYmE="),
        (b"foobar".as_slice(), "Zm9vYmFy"),
    ];
    for (bytes, expected) in cases {
        let mut encoded = String::from("prefix");
        append_standard_base64(bytes, &mut encoded);
        assert_eq!(&encoded[6..], expected);
    }
}


#[test]
fn random_chunking_matches_single_update() {
    let mut seed = 0x9e37_79b9_7f4a_7c15;
    for length in [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000, 4099] {
        let bytes = deterministic_buffer(length, &mut seed);
        let mut single_update = Sha256::new();
        single_update.update(&bytes);
        assert_eq!(hash_bytes_with_random_chunks(&bytes, &mut seed), single_update.finalize());
    }
}

#[test]
fn base64_digests_match_node_crypto() {
    let cases = [
        ("hello\n", "WJG1tSLV3whtD/CxEPvZ0hu0/HFjrzTQgoai6Eb2vgM="),
        ("native fixture asset 1\n", "YugSLTOiQ6bFB9QpUFAMbncAUYN9ON2l3qYqwGllgBA="),
        ("{\"fixture\":\"native\"}", "MiIsKqCR7Ps4OlPdpBh2XdRWhTIHPEclpVUVVA6w81g="),
    ];
    for (text, expected) in cases {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        let mut encoded = String::new();
        append_standard_base64(&hasher.finalize(), &mut encoded);
        assert_eq!(encoded, expected);
    }
}
