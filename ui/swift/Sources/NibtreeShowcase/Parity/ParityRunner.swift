import AppKit
import NibtreeUI
import SwiftUI

/// The Swift half of the parity check (scripts/parity.ts):
/// - `--parity <scenarios> <out>` draws every scenario in light and dark to `<out>/<id>-<light|dark>.png`.
/// - `--bench <scenarios> <count> <warmup> <runs> [id ...]` prints one JSON line per scenario (only the ids given, if
///   any): the fastest of `runs` timings (after `warmup` unmeasured ones) to lay out `count` copies and draw those in
///   the viewport, like the web side's `nativeBench`. parity.ts benches each scenario in its own process: a big
///   scenario leaves the process slower for every one after it (icon-every-name made the rest about 1.7 times slower).
@MainActor
enum ParityRunner {
    /// Handles the parity arguments if present; returns whether it did.
    static func runIfRequested() -> Bool {
        let arguments = CommandLine.arguments
        do {
            if let index = arguments.firstIndex(of: "--parity"), index + 2 < arguments.count {
                let scenarios = try Scenario.load(from: URL(fileURLWithPath: arguments[index + 1]))
                try shoot(scenarios, to: URL(fileURLWithPath: arguments[index + 2], isDirectory: true))
                return true
            }
            if let index = arguments.firstIndex(of: "--bench"), index + 4 < arguments.count {
                let ids = Set(arguments[(index + 5)...])
                let scenarios = try Scenario.load(from: URL(fileURLWithPath: arguments[index + 1]))
                    .filter { ids.isEmpty || ids.contains($0.id) }
                bench(
                    scenarios, count: Int(arguments[index + 2]) ?? 100, warmup: Int(arguments[index + 3]) ?? 2,
                    runs: Int(arguments[index + 4]) ?? 7)
                return true
            }
        } catch {
            FileHandle.standardError.write(Data("Parity failed: \(error)\n".utf8))
            exit(1)
        }
        return false
    }

    private static func frame(_ scenario: Scenario, scheme: ColorScheme) -> some View {
        let resolved = ResolvedNode(scenario.node)
        return ParityFrame(width: scenario.width) { ScenarioView(node: resolved).sized(scenario.height) }
            .nibtreeTheme()
            .environment(\.colorScheme, scheme)
            .environment(\.nibtreeStill, true)
    }

    private static func shoot(_ scenarios: [Scenario], to folder: URL) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for scenario in scenarios {
            for (name, scheme) in [("light", ColorScheme.light), ("dark", ColorScheme.dark)] {
                let renderer = ImageRenderer(content: frame(scenario, scheme: scheme))
                renderer.scale = 2
                guard let drawn = renderer.cgImage else {
                    continue
                }
                let panel = Palette(themeId: scheme == .dark ? Palette.darkThemeId : Palette.lightThemeId)
                    .color(.panel)
                let image = roundedUp(drawn, filling: NSColor(panel).cgColor)
                let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
                try data?.write(to: folder.appendingPathComponent("\(scenario.id)-\(name).png"))
            }
        }
        print("Drew \(scenarios.count * 2) images to \(folder.path)")
    }

    /// The picture padded at the bottom to whole points (an even pixel height at 2x) with `fill`, the way Playwright
    /// rounds an element screenshot up to whole CSS pixels.
    private static func roundedUp(_ image: CGImage, filling fill: CGColor) -> CGImage {
        let height = (image.height + 1) / 2 * 2
        guard height != image.height,
            let context = CGContext(
                data: nil, width: image.width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else {
            return image
        }
        context.setFillColor(fill)
        context.fill(CGRect(x: 0, y: 0, width: image.width, height: height))
        context.draw(image, in: CGRect(x: 0, y: height - image.height, width: image.width, height: image.height))
        return context.makeImage() ?? image
    }

    private static func bench(_ scenarios: [Scenario], count: Int, warmup: Int, runs: Int) {
        // An app's main thread runs user-interactive, as does WebKit's page process; a tool started by a CI runner
        // (a background service) may not.
        pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0)
        for scenario in scenarios {
            let resolved = ResolvedNode(scenario.node)
            let shown = shownCopies(scenario)
            var times: [Double] = []
            for run in 0..<(warmup + runs) {
                // Each run's renderer leaves autoreleased drawings behind: drained per run, or every scenario after a
                // big one (icon-every-name) runs in a bloated process and times slower than it is.
                let ms = autoreleasepool { time(resolved, scenario, count: count, shown: shown) }
                if run >= warmup {
                    times.append(ms)
                }
            }
            print("{\"id\": \"\(scenario.id)\", \"ms\": \(times.min() ?? -1)}")
        }
    }

    /// How many copies reach into the 1000 by 800 point viewport, with one to spare, from one copy's height.
    private static func shownCopies(_ scenario: Scenario) -> Int {
        let renderer = ImageRenderer(content: frame(scenario, scheme: .light))
        renderer.scale = 1
        let height = Double(renderer.cgImage?.height ?? 1)
        return Int((800 / max(1, height - 1)).rounded(.up)) + 1
    }

    /// Lays out `count` copies of the scenario and draws the first `shown`; returns the milliseconds it took.
    private static func time(_ resolved: ResolvedNode, _ scenario: Scenario, count: Int, shown: Int) -> Double {
        let start = DispatchTime.now().uptimeNanoseconds
        // Like the web side: every copy is laid out, but only a 1000 by 800 point viewport is drawn. A clip alone
        // still records every copy's drawing (each canvas runs), which WebKit skips for what is off screen.
        let list = ParityFrame(width: scenario.width) {
            VStack(spacing: 0) {
                ForEach(0..<count, id: \.self) { index in
                    ScenarioView(node: resolved).sized(scenario.height).modifier(OffScreen(hidden: index >= shown))
                }
            }
        }
        .frame(width: 1000, height: 800, alignment: .topLeading)
        .clipped()
        .nibtreeTheme()
        let renderer = ImageRenderer(content: list)
        renderer.scale = 2
        _ = renderer.cgImage
        return Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    }
}

/// A copy below the viewport: laid out, but not drawn.
private struct OffScreen: ViewModifier {
    let hidden: Bool

    func body(content: Content) -> some View {
        if hidden {
            content.hidden()
        } else {
            content
        }
    }
}

/// A scenario at its width on the theme's panel color, with no padding, like the web harness's frame. Its height is
/// rounded up to whole points, like Playwright's screenshot of the web frame, which also keeps ImageRenderer's
/// coordinates (measured from the picture's center) on whole device pixels, as a window's are.
struct ParityFrame<Content: View>: View {
    let width: Double
    @ViewBuilder let content: () -> Content
    @Environment(\.nibtreePalette) private var palette

    var body: some View {
        WholePoints {
            // A column like the web frame's flex column, so a child's own alignment (a vertical NDivider centers)
            // applies at the top level too.
            NStack(gap: .none) { content() }.frame(width: width, alignment: .topLeading)
        }
        .background(palette.color(.panel))
    }
}

/// Its child's size rounded up to whole points, the child at its top left.
private struct WholePoints: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let size = subviews.first?.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil)) ?? .zero
        return CGSize(width: size.width.rounded(.up), height: size.height.rounded(.up))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let offer = ProposedViewSize(width: bounds.width, height: nil)
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: offer)
    }
}

extension View {
    /// A scenario's set height, for components that fill their parent; none leaves the content's height.
    @ViewBuilder
    func sized(_ height: Double?) -> some View {
        if let height {
            frame(height: height, alignment: .top)
        } else {
            self
        }
    }
}
