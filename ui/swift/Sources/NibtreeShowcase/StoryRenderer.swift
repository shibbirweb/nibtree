import AppKit
import NibtreeUI
import SwiftUI

/// `NibtreeShowcase --render <folder>`: draws every story in light and dark to `<Name>-light.png` and
/// `<Name>-dark.png` without opening a window (no screen recording permission needed), for reviews and for comparing
/// with ui/web's showcase.
@MainActor
enum StoryRenderer {
    /// The folder after `--render`, if the program was started that way.
    static var requestedFolder: URL? {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: "--render"), index + 1 < arguments.count else {
            return nil
        }
        return URL(fileURLWithPath: arguments[index + 1], isDirectory: true)
    }

    /// Writes every story's images; returns the files written.
    static func renderAll(to folder: URL) throws -> [URL] {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var written: [URL] = []
        for story in Stories.all {
            for (name, scheme) in [("light", ColorScheme.light), ("dark", ColorScheme.dark)] {
                let pane = RenderPane { story.make() }
                    .nibtreeTheme()
                    .environment(\.colorScheme, scheme)
                let renderer = ImageRenderer(content: pane)
                renderer.scale = 2
                guard let image = renderer.cgImage else {
                    continue
                }
                let file = folder.appendingPathComponent("\(story.name)-\(name).png")
                let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
                try data?.write(to: file)
                written.append(file)
            }
        }
        return written
    }
}

/// A story on its theme's panel color, 640 points wide, like one pane of the showcase window.
private struct RenderPane<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.nibtreePalette) private var palette

    var body: some View {
        content()
            .padding(24)
            .frame(width: 640, alignment: .topLeading)
            .background(palette.color(.panel))
    }
}
