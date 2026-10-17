import AppKit
import SwiftUI

/// The Swift UI library's showcase (`bun run ui:swift`), the twin of ui/web's (`bun run ui`): every component in
/// light and dark side by side, in any pair of color themes.
@main
struct ShowcaseApp: App {
    init() {
        if let folder = StoryRenderer.requestedFolder {
            do {
                let files = try StoryRenderer.renderAll(to: folder)
                print("Rendered \(files.count) images to \(folder.path)")
                exit(0)
            } catch {
                FileHandle.standardError.write(Data("Could not render: \(error)\n".utf8))
                exit(1)
            }
        }
        // Started with `swift run` the program is a plain process; make it a regular app with a Dock icon and focus.
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate()
    }

    var body: some Scene {
        WindowGroup("Nibtree UI") {
            ShowcaseView()
                .frame(minWidth: 900, minHeight: 600)
        }
    }
}
