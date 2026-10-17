#!/bin/sh
# Runs the Swift UI library's tests (`bun run ui:swift:test`). With only the Command Line Tools (no Xcode), Swift
# Testing lives in their Frameworks folder, which swift test does not search by itself.
set -e
cd "$(dirname "$0")/.."
developer=/Library/Developer/CommandLineTools/Library/Developer
frameworks=$developer/Frameworks
if ! xcode-select -p | grep -q Xcode && [ -d "$frameworks/Testing.framework" ]; then
  # Testing.framework and its lib_TestingInterop.dylib (in usr/lib) are found through these paths.
  exec swift test -Xswiftc -F -Xswiftc "$frameworks" -Xlinker -F -Xlinker "$frameworks" \
    -Xlinker -rpath -Xlinker "$frameworks" -Xlinker -rpath -Xlinker "$developer/usr/lib" "$@"
fi
exec swift test "$@"
