//! One command argument: where its value comes from in each host.

use proc_macro2::{Span, TokenStream as Tokens};
use quote::quote;
use syn::{FnArg, GenericArgument, Ident, Pat, PathArguments, Type};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Data,
    State,
    Window,
    App,
    Channel,
    Raw,
}

pub struct Arg {
    pub ident: Ident,
    pub ty: Type,
    pub kind: Kind,
    /// The message type of a `Channel<T>`, or the state type of a `State<'_, T>`.
    message: Option<Type>,
}

impl Arg {
    pub fn parse(input: &FnArg) -> syn::Result<Arg> {
        let FnArg::Typed(typed) = input else {
            return Err(syn::Error::new(Span::call_site(), "commands take no self"));
        };
        let Pat::Ident(pattern) = &*typed.pat else {
            return Err(syn::Error::new(Span::call_site(), "command arguments must be plain names"));
        };
        let ty = (*typed.ty).clone();
        let kind = match last_segment(&ty).as_deref() {
            Some("State") => Kind::State,
            Some("Window") => Kind::Window,
            Some("AppHandle") => Kind::App,
            Some("Channel") => Kind::Channel,
            Some("Request") => Kind::Raw,
            _ => Kind::Data,
        };
        let message = if matches!(kind, Kind::Channel | Kind::State) { first_type_argument(&ty) } else { None };
        Ok(Arg { ident: pattern.ident.clone(), ty, kind, message })
    }

    /// The type the shared body sees.
    pub fn shared_type(&self) -> Type {
        let message = &self.message;
        let tokens = match self.kind {
            Kind::Data => return self.ty.clone(),
            Kind::State => match message {
                Some(state) => quote!(&#state),
                None => quote!(&crate::state::AppState),
            },
            Kind::Window => quote!(crate::host::HostWindow),
            Kind::App => quote!(crate::host::HostApp),
            Kind::Channel => quote!(crate::host::HostChannel<#message>),
            Kind::Raw => quote!(crate::host::RawBody),
        };
        syn::parse2(tokens).expect("a host type")
    }

    /// The type the Tauri command takes. A Channel's messages are sent as ready JSON, so its Tauri
    /// type is the raw one; the page's Channel reads the same messages either way.
    pub fn desktop_type(&self) -> Type {
        match self.kind {
            Kind::Channel => syn::parse2(quote!(::tauri::ipc::Channel<::tauri::ipc::InvokeResponseBody>))
                .expect("a channel type"),
            _ => self.ty.clone(),
        }
    }

    /// The Tauri command's argument turned into the shared body's argument.
    pub fn desktop_value(&self) -> Tokens {
        let ident = &self.ident;
        match self.kind {
            Kind::Data => quote!(#ident),
            Kind::State => quote!(#ident.inner()),
            Kind::Window => quote!(crate::host::HostWindow::from_tauri(&#ident)),
            Kind::App => quote!(crate::host::HostApp::from_tauri(&#ident)),
            Kind::Channel => quote!(crate::host::HostChannel::from_tauri(#ident)),
            Kind::Raw => quote!(crate::host::RawBody::from_request(&#ident)?),
        }
    }

    /// Reads the argument out of a browser call.
    pub fn browser_read(&self) -> Tokens {
        let ident = &self.ident;
        let key = camel_case(&ident.to_string());
        let ty = &self.ty;
        let message = &self.message;
        match self.kind {
            Kind::Data => quote!(let #ident: #ty = __args.take(#key)?;),
            Kind::State => quote!(let #ident = __app.state();),
            Kind::Window => quote!(let #ident = __window.clone();),
            Kind::App => quote!(let #ident = __app.clone();),
            Kind::Channel => quote!(let #ident = __args.channel::<#message>(#key, &__window, &__app)?;),
            Kind::Raw => quote!(let #ident = crate::host::RawBody::new(__raw.take().unwrap_or_default());),
        }
    }
}

pub fn last_segment(ty: &Type) -> Option<String> {
    match ty {
        Type::Path(path) => path.path.segments.last().map(|segment| segment.ident.to_string()),
        Type::Reference(reference) => last_segment(&reference.elem),
        _ => None,
    }
}

fn first_type_argument(ty: &Type) -> Option<Type> {
    let Type::Path(path) = ty else {
        return None;
    };
    let PathArguments::AngleBracketed(arguments) = &path.path.segments.last()?.arguments else {
        return None;
    };
    arguments.args.iter().find_map(|argument| match argument {
        GenericArgument::Type(ty) => Some(ty.clone()),
        _ => None,
    })
}

/// `repo_path` -> `repoPath`, the name Tauri reads arguments under.
pub fn camel_case(snake: &str) -> String {
    let mut out = String::with_capacity(snake.len());
    let mut upper = false;
    for character in snake.chars() {
        if character == '_' {
            upper = !out.is_empty();
        } else if upper {
            out.extend(character.to_uppercase());
            upper = false;
        } else {
            out.push(character);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::camel_case;

    #[test]
    fn camel_case_matches_tauri_argument_names() {
        assert_eq!(camel_case("repo_path"), "repoPath");
        assert_eq!(camel_case("known_hash"), "knownHash");
        assert_eq!(camel_case("pull"), "pull");
        assert_eq!(camel_case("file_paths_2"), "filePaths2");
    }
}
