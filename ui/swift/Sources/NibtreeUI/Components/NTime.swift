import SwiftUI

/// How a time reads: "5 min ago" (`ago`, a date after a week), a short age "5m" (`age`) or a countdown "in 3h 20m"
/// (`until`, "now" when due).
public enum NTimeFormat: String, CaseIterable, Sendable {
    case ago, age, until
}

/// A moment relative to now: the Swift side of ui/web `Time` (docs/components/Time.md). The web nests it in a Text for
/// tone and size; here it hands its words to the text that shows them (`NText($0, tone: .dim, tabular: true)`), and
/// alone it is body text with digits of one width. A live time stays current from one clock shared by every time,
/// like the web's, refreshed every 30 seconds; turn `live` off in long lists that never stay open for minutes. The
/// web's tooltip is the caller's `.help(NTimeText.fullDate(time))`: a tooltip costs as much as the text.
public struct NTime<Words: View>: View {
    private let time: Date
    private let format: NTimeFormat
    private let live: Bool
    private let words: (String) -> Words

    public init(
        time: Date, format: NTimeFormat = .ago, live: Bool = true, @ViewBuilder words: @escaping (String) -> Words
    ) {
        self.time = time
        self.format = format
        self.live = live
        self.words = words
    }

    public var body: some View {
        // Reading the shared clock makes this time redraw on its ticks; a still one reads the time once.
        words(NTimeText.text(time, now: live ? NClock.shared.now : Date(), format: format))
    }
}

/// The time every live `NTime` reads: one timer for all of them, where a `TimelineView` each cost a lone time a
/// fifth of its drawing. It starts with the first live time and ticks every 30 seconds after.
@MainActor
@Observable
final class NClock {
    static let shared = NClock()
    /// The web's `CLOCK_TICK_MS`: the finest unit shown is a minute.
    nonisolated static let tick: TimeInterval = 30

    private(set) var now = Date()

    private init() {
        Timer.scheduledTimer(withTimeInterval: Self.tick, repeats: true) { _ in
            MainActor.assumeIsolated { NClock.shared.now = Date() }
        }
    }
}

extension NTime where Words == NText {
    /// The time in body text, digits of one width.
    public init(time: Date, format: NTimeFormat = .ago, live: Bool = true) {
        self.init(time: time, format: format, live: live) { NText($0, tabular: true) }
    }
}
