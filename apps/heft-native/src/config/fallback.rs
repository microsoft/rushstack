#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fallback {
    pub reason: &'static str,
}

pub type ConfigResult<T> = Result<T, Fallback>;

pub fn fallback<T>(reason: &'static str) -> ConfigResult<T> {
    Err(Fallback { reason })
}
