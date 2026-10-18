//! `#[command]` turns one command function into two entry points: the Tauri command the desktop app
//! registers, and `__browser__<name>`, which the browser server calls with JSON arguments. The body is
//! compiled once against host-neutral types (`crate::host`), so both hosts run the same code.
//!
//! Arguments that come from the host instead of the page are recognised by their type's last segment:
//! `State` (the app state), `Window`, `AppHandle`, `Channel<T>` and `Request` (a raw body). The rest
//! are data and are read from the JSON arguments under their camelCase name, like Tauri does.
//! `#[command(desktop)]` keeps a desktop-only body as it is; the browser answers it with an error.

use proc_macro::TokenStream;
use proc_macro2::TokenStream as Tokens;
use quote::{format_ident, quote};
use syn::punctuated::Punctuated;
use syn::{parse_macro_input, FnArg, ItemFn, Path, ReturnType, Token};

mod args;

use args::{last_segment, Arg, Kind};

#[proc_macro_attribute]
pub fn command(attr: TokenStream, item: TokenStream) -> TokenStream {
    let desktop_only = !attr.is_empty();
    let function = parse_macro_input!(item as ItemFn);
    match expand(function, desktop_only) {
        Ok(tokens) => tokens.into(),
        Err(error) => error.to_compile_error().into(),
    }
}

/// `browser_handler![a::b, c::d]`: a function from a command name to its browser entry point.
#[proc_macro]
pub fn browser_handler(input: TokenStream) -> TokenStream {
    let parser = Punctuated::<Path, Token![,]>::parse_terminated;
    let paths = parse_macro_input!(input with parser);
    let arms = paths.iter().map(|path| {
        let mut entry = path.clone();
        let last = entry.segments.last_mut().expect("a command path");
        let name = last.ident.to_string();
        last.ident = format_ident!("__browser__{}", last.ident);
        quote! { #name => ::std::option::Option::Some(#entry(call)), }
    });
    quote! {
        |command_name: &str, call: crate::host::Call| -> ::std::option::Option<crate::host::Reply> {
            match command_name {
                #(#arms)*
                _ => ::std::option::Option::None,
            }
        }
    }
    .into()
}

fn expand(function: ItemFn, desktop_only: bool) -> syn::Result<Tokens> {
    let name = function.sig.ident.clone();
    let browser_name = format_ident!("__browser__{}", name);
    let vis = function.vis.clone();
    if desktop_only {
        let message = format!("{name} is only available in the desktop app");
        return Ok(quote! {
            #[::tauri::command]
            #function
            #[doc(hidden)]
            #[allow(non_snake_case, dead_code)]
            #vis fn #browser_name(_call: crate::host::Call) -> crate::host::Reply {
                ::std::boxed::Box::pin(async move {
                    ::std::result::Result::Err(crate::error::AppError::invalid(#message))
                })
            }
        });
    }
    let args = function.sig.inputs.iter().map(Arg::parse).collect::<syn::Result<Vec<_>>>()?;
    let is_async = function.sig.asyncness.is_some();
    let returns_result = returns_result(&function.sig.output);
    let host_args = args.iter().any(|arg| arg.kind != Kind::Data);

    // Without host arguments the function itself is the shared body; otherwise the body moves to an
    // inner function over host-neutral types and the Tauri command converts its arguments into them.
    let (shared, desktop) = if host_args {
        let inner_name = format_ident!("__shared__{}", name);
        let mut inner = function.clone();
        inner.sig.ident = inner_name.clone();
        inner.vis = syn::Visibility::Inherited;
        inner.attrs.retain(|attr| !attr.path().is_ident("doc"));
        for (input, arg) in inner.sig.inputs.iter_mut().zip(&args) {
            if let FnArg::Typed(typed) = input {
                *typed.ty = arg.shared_type();
            }
        }
        let mut outer = function.clone();
        let conversions = args.iter().map(Arg::desktop_value);
        for (input, arg) in outer.sig.inputs.iter_mut().zip(&args) {
            if let FnArg::Typed(typed) = input {
                *typed.ty = arg.desktop_type();
            }
        }
        let await_inner = if is_async { quote!(.await) } else { Tokens::new() };
        let call = quote!(#inner_name(#(#conversions),*)#await_inner);
        let attrs = &outer.attrs;
        let sig = &outer.sig;
        let desktop = quote! {
            #[::tauri::command]
            #(#attrs)*
            #vis #sig {
                #call
            }
        };
        (quote!(#[allow(non_snake_case)] #inner), desktop)
    } else {
        (Tokens::new(), quote!(#[::tauri::command] #function))
    };

    let target = if host_args { format_ident!("__shared__{}", name) } else { name.clone() };
    let reads = args.iter().map(Arg::browser_read);
    let names = args.iter().map(|arg| arg.ident.clone());
    let await_call = if is_async { quote!(.await) } else { Tokens::new() };
    let result = if returns_result {
        quote!(let value = #target(#(#names),*)#await_call?;)
    } else {
        quote!(let value = #target(#(#names),*)#await_call;)
    };
    let browser = quote! {
        #[doc(hidden)]
        #[allow(non_snake_case, unused_variables, unused_mut, clippy::let_unit_value)]
        #vis fn #browser_name(call: crate::host::Call) -> crate::host::Reply {
            ::std::boxed::Box::pin(async move {
                let crate::host::Call { args: mut __args, window: __window, app: __app, raw: mut __raw } = call;
                #(#reads)*
                #result
                crate::host::reply_value(value)
            })
        }
    };
    Ok(quote! { #shared #desktop #browser })
}

fn returns_result(output: &ReturnType) -> bool {
    match output {
        ReturnType::Default => false,
        ReturnType::Type(_, ty) => {
            matches!(last_segment(ty).as_deref(), Some("AppResult") | Some("Result"))
        }
    }
}
