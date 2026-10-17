// swift-tools-version: 6.0
// The Swift version of the UI library (ui/web): the same components with the same names (an `N` before each, so
// they never clash with SwiftUI's own), built only on the design tokens that `bun run ui:tokens` writes into
// Sources/NibtreeTokens. The native app (Nibtree Native) is composed from these components.
import PackageDescription

let package = Package(
    name: "NibtreeUI",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "NibtreeUI", targets: ["NibtreeUI"]),
        .library(name: "NibtreeTokens", targets: ["NibtreeTokens"]),
        .executable(name: "NibtreeShowcase", targets: ["NibtreeShowcase"]),
    ],
    targets: [
        .target(name: "NibtreeTokens"),
        .target(name: "NibtreeUI", dependencies: ["NibtreeTokens"]),
        .executableTarget(name: "NibtreeShowcase", dependencies: ["NibtreeUI", "NibtreeTokens"]),
        .testTarget(name: "NibtreeUITests", dependencies: ["NibtreeUI", "NibtreeTokens"]),
    ]
)
