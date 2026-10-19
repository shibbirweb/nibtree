import Testing

/// Suites that put real windows on screen (clear and off the screens): they run one at a time, as two at once would
/// take the keyboard focus from each other.
@Suite(.serialized)
@MainActor
enum Windowed {}
