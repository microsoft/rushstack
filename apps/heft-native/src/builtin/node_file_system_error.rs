use std::io;

const LIBUV_ERROR_NAMES_AND_DESCRIPTIONS: &[(i32, &str, &str)] = &[
    (1, "EPERM", "operation not permitted"),
    (2, "ENOENT", "no such file or directory"),
    (5, "EIO", "i/o error"),
    (9, "EBADF", "bad file descriptor"),
    (12, "ENOMEM", "not enough memory"),
    (13, "EACCES", "permission denied"),
    (16, "EBUSY", "resource busy or locked"),
    (17, "EEXIST", "file already exists"),
    (18, "EXDEV", "cross-device link not permitted"),
    (20, "ENOTDIR", "not a directory"),
    (21, "EISDIR", "illegal operation on a directory"),
    (22, "EINVAL", "invalid argument"),
    (23, "ENFILE", "file table overflow"),
    (24, "EMFILE", "too many open files"),
    (26, "ETXTBSY", "text file is busy"),
    (27, "EFBIG", "file too large"),
    (28, "ENOSPC", "no space left on device"),
    (30, "EROFS", "read-only file system"),
    (31, "EMLINK", "too many links"),
    (36, "ENAMETOOLONG", "name too long"),
    (39, "ENOTEMPTY", "directory not empty"),
    (40, "ELOOP", "too many symbolic links encountered"),
];

const ENOENT: i32 = 2;
const ENOTDIR: i32 = 20;

#[derive(Debug)]
pub struct NodeFileSystemError {
    pub message: String,
    node_core_library_prefix: Option<String>,
}

impl NodeFileSystemError {
    pub fn new(error: io::Error, syscall: &str, path: &str, destination: Option<&str>) -> NodeFileSystemError {
        let Some(errno) = error.raw_os_error() else {
            return NodeFileSystemError::from_message(&error.to_string());
        };
        let (code, description) = LIBUV_ERROR_NAMES_AND_DESCRIPTIONS
            .iter()
            .find(|(known_errno, _, _)| *known_errno == errno)
            .map(|(_, code, description)| (*code, *description))
            .unwrap_or(("UNKNOWN", "unknown error"));
        let mut node_message = format!("{code}: {description}, {syscall} '{path}'");
        if let Some(destination) = destination {
            node_message.push_str(&format!(" -> '{destination}'"));
        }
        let node_core_library_prefix = match code {
            "ENOENT" => Some(format!("File does not exist: {path}\n")),
            "ENOTDIR" => Some(format!("Folder does not exist: {path}\n")),
            "EEXIST" => Some(format!("File or folder already exists: {}\n", destination.unwrap_or("undefined"))),
            "EPERM" if syscall == "unlink" => Some(format!("File or folder could not be deleted: {path}\n")),
            "EISDIR" => Some(format!("Target is a folder, not a file: {path}\n")),
            _ => None,
        };
        let message = format!("{}{node_message}", node_core_library_prefix.as_deref().unwrap_or_default());
        NodeFileSystemError { message, node_core_library_prefix }
    }

    pub fn from_message(message: &str) -> NodeFileSystemError {
        NodeFileSystemError { message: message.to_owned(), node_core_library_prefix: None }
    }

    pub fn wrapped_again(mut self) -> NodeFileSystemError {
        if let Some(prefix) = &self.node_core_library_prefix {
            self.message.insert_str(0, prefix);
        }
        self
    }
}

pub fn is_node_not_exist_error(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(ENOENT | ENOTDIR))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn errno(code: i32) -> io::Error {
        io::Error::from_raw_os_error(code)
    }

    #[test]
    fn messages_match_node_and_node_core_library() {
        assert_eq!(
            NodeFileSystemError::new(errno(13), "open", "/p/a.txt", None).message,
            "EACCES: permission denied, open '/p/a.txt'"
        );
        assert_eq!(
            NodeFileSystemError::new(errno(2), "open", "/p/a.txt", None).message,
            "File does not exist: /p/a.txt\nENOENT: no such file or directory, open '/p/a.txt'"
        );
        assert_eq!(
            NodeFileSystemError::new(errno(13), "copyfile", "/p/a", Some("/p/b")).message,
            "EACCES: permission denied, copyfile '/p/a' -> '/p/b'"
        );
        assert_eq!(
            NodeFileSystemError::new(errno(1), "unlink", "/p/x", None).message,
            "File or folder could not be deleted: /p/x\nEPERM: operation not permitted, unlink '/p/x'"
        );
        let twice = NodeFileSystemError::new(errno(21), "unlink", "/p/d", None).wrapped_again();
        assert_eq!(
            twice.message,
            "Target is a folder, not a file: /p/d\nTarget is a folder, not a file: /p/d\nEISDIR: illegal operation on a directory, unlink '/p/d'"
        );
        assert_eq!(NodeFileSystemError::from_message("plain").wrapped_again().message, "plain");
    }
}
