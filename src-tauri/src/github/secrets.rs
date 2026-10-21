//! Where the GitHub token lives: only the operating system's keychain (macOS Keychain,
//! Windows Credential Manager, the Secret Service on Linux). Behind a trait so the tests use an in-memory store.

use crate::error::{AppError, AppResult};

/// The keychain item's service; the account is the GitHub host.
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
const SERVICE: &str = "io.github.shibbirweb.nibtree.github";

pub trait SecretStore: Send + Sync {
    fn read(&self, host: &str) -> AppResult<Option<String>>;
    fn write(&self, host: &str, token: &str) -> AppResult<()>;
    /// Removing a missing item is not an error.
    fn remove(&self, host: &str) -> AppResult<()>;
}

pub struct KeychainStore;

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn entry(host: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, host).map_err(keychain_error)
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn keychain_error(err: keyring::Error) -> AppError {
    if no_keyring(&err) {
        return AppError::invalid(format!(
            "No keyring to save the token in. Start GNOME Keyring or KWallet, or use the GitHub CLI instead. ({err})"
        ));
    }
    AppError::invalid(format!("Keychain: {err}"))
}

/// Linux only: no Secret Service on the session bus, or it refused access (a locked keyring left locked).
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn no_keyring(err: &keyring::Error) -> bool {
    cfg!(target_os = "linux") && matches!(err, keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_))
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
impl SecretStore for KeychainStore {
    fn read(&self, host: &str) -> AppResult<Option<String>> {
        match entry(host)?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            // A Linux box without a Secret Service (a server, a container) simply has no saved token.
            Err(err) if no_keyring(&err) => Ok(None),
            Err(err) => Err(keychain_error(err)),
        }
    }

    fn write(&self, host: &str, token: &str) -> AppResult<()> {
        entry(host)?.set_password(token).map_err(keychain_error)
    }

    fn remove(&self, host: &str) -> AppResult<()> {
        match entry(host)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) if no_keyring(&err) => Ok(()),
            Err(err) => Err(keychain_error(err)),
        }
    }
}

// No keychain backend yet on other platforms: refuse rather than keep the token in a file.
#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
impl SecretStore for KeychainStore {
    fn read(&self, _host: &str) -> AppResult<Option<String>> {
        Ok(None)
    }

    fn write(&self, _host: &str, _token: &str) -> AppResult<()> {
        Err(AppError::invalid(
            "Saving a GitHub token is not supported on this system yet. Use the GitHub CLI instead.",
        ))
    }

    fn remove(&self, _host: &str) -> AppResult<()> {
        Ok(())
    }
}

#[cfg(test)]
pub mod memory {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::SecretStore;
    use crate::error::AppResult;

    #[derive(Default)]
    pub struct MemoryStore {
        items: Mutex<HashMap<String, String>>,
    }

    impl MemoryStore {
        pub fn get(&self, host: &str) -> Option<String> {
            self.items.lock().unwrap().get(host).cloned()
        }
    }

    impl SecretStore for MemoryStore {
        fn read(&self, host: &str) -> AppResult<Option<String>> {
            Ok(self.get(host))
        }

        fn write(&self, host: &str, token: &str) -> AppResult<()> {
            self.items.lock().unwrap().insert(host.to_string(), token.to_string());
            Ok(())
        }

        fn remove(&self, host: &str) -> AppResult<()> {
            self.items.lock().unwrap().remove(host);
            Ok(())
        }
    }
}
