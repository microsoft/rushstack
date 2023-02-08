use napi_derive::napi;

#[napi]
pub fn hello_world() -> String {
    "Hello world".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = hello_world();
        assert_eq!(result, "Hello world".to_string());
    }
}
