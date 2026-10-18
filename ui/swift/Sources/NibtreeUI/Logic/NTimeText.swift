import Foundation

/// The words for a moment relative to now, as the app writes them: the Swift side of ui/web `logic/timeText.ts`.
/// The log's "5 min ago", the AI panel's short "5m" age and AI usage's "in 3h 20m" reset.
public enum NTimeText {
    private static let minute = 60.0
    private static let hour = 60 * minute
    private static let day = 24 * hour

    /// The words for `time` seen at `now`.
    public static func text(_ time: Date, now: Date, format: NTimeFormat) -> String {
        switch format {
        case .age: age(now.timeIntervalSince(time))
        case .until: until(time.timeIntervalSince(now))
        case .ago: ago(now.timeIntervalSince(time), time)
        }
    }

    /// The full date and time for a tooltip: "Mon, Mar 3, 2025, 09:41 AM".
    public static func fullDate(_ time: Date) -> String {
        longDate.string(from: time)
    }

    /// "just now", "5 min ago", "2 h ago", "yesterday", "3 d ago", then the date after a week (or ahead of now).
    private static func ago(_ elapsed: TimeInterval, _ time: Date) -> String {
        if elapsed < 0 || elapsed >= 7 * day {
            return shortDate.string(from: time)
        }
        if elapsed < minute {
            return "just now"
        }
        if elapsed < hour {
            return "\(Int(elapsed / minute)) min ago"
        }
        if elapsed < day {
            return "\(Int(elapsed / hour)) h ago"
        }
        let days = Int(elapsed / day)
        return days == 1 ? "yesterday" : "\(days) d ago"
    }

    /// "now", "5m", "2h", "3d": how long something has been in its state.
    private static func age(_ elapsed: TimeInterval) -> String {
        let minutes = Int(max(0, elapsed) / minute)
        if minutes < 1 {
            return "now"
        }
        if minutes < 60 {
            return "\(minutes)m"
        }
        let hours = minutes / 60
        return hours < 24 ? "\(hours)h" : "\(hours / 24)d"
    }

    /// "now" once due, else "in 45m", "in 3h 20m", "in 2d 4h".
    private static func until(_ left: TimeInterval) -> String {
        if left <= 0 {
            return "now"
        }
        let minutes = Int((left / minute).rounded(.up))
        if minutes < 60 {
            return "in \(minutes)m"
        }
        let hours = minutes / 60
        if hours < 24 {
            return minutes % 60 == 0 ? "in \(hours)h" : "in \(hours)h \(minutes % 60)m"
        }
        let days = hours / 24
        return hours % 24 == 0 ? "in \(days)d" : "in \(days)d \(hours % 24)h"
    }

    /// The web's `Intl.DateTimeFormat("en-US", ...)` shapes, in the local time zone like the browser's.
    private static let shortDate = formatter("MMM d, y")
    private static let longDate = formatter("EEE, MMM d, y, hh:mm a")

    private static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = format
        return formatter
    }
}
