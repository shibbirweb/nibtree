import Foundation
import Testing

@testable import NibtreeUI

/// The same cases as ui/web `logic/timeText.test.ts`.
@Suite("Time text")
struct TimeTextTests {
    /// Oct 12, 2026 at noon UTC.
    let now = Date(timeIntervalSince1970: 1_791_806_400)

    private func minutes(_ count: Double) -> TimeInterval { count * 60 }

    private func text(_ offset: TimeInterval, _ format: NTimeFormat) -> String {
        NTimeText.text(now.addingTimeInterval(offset), now: now, format: format)
    }

    @Test("ago reads like the log")
    func ago() {
        #expect(text(-20, .ago) == "just now")
        #expect(text(-minutes(5), .ago) == "5 min ago")
        #expect(text(-minutes(150), .ago) == "2 h ago")
        #expect(text(-minutes(60 * 30), .ago) == "yesterday")
        #expect(text(-minutes(60 * 24 * 3), .ago) == "3 d ago")
    }

    @Test("ago shows the date after a week and for a time ahead of now")
    func agoDate() {
        #expect(text(-minutes(60 * 24 * 10), .ago) == "Oct 2, 2026")
        #expect(text(minutes(5), .ago) == "Oct 12, 2026")
    }

    @Test("age is short, like the AI panel")
    func age() {
        #expect(text(-10, .age) == "now")
        #expect(text(-minutes(5), .age) == "5m")
        #expect(text(-minutes(125), .age) == "2h")
        #expect(text(-minutes(60 * 50), .age) == "2d")
        #expect(text(minutes(5), .age) == "now")
    }

    @Test("until counts down, like AI usage resets")
    func until() {
        #expect(text(-0.001, .until) == "now")
        #expect(text(minutes(45), .until) == "in 45m")
        #expect(text(minutes(200), .until) == "in 3h 20m")
        #expect(text(minutes(180), .until) == "in 3h")
        #expect(text(minutes(60 * 52), .until) == "in 2d 4h")
    }

    @Test("the full date names the day, date and time")
    func fullDate() {
        let words = NTimeText.fullDate(now)
        #expect(words.range(of: #"^\w{3}, Oct 12, 2026, \d{2}:\d{2} (AM|PM)$"#, options: .regularExpression) != nil)
    }
}
