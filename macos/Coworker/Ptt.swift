import Foundation

enum PttEvent: Equatable {
    case down
    /// cancelled: the hold was a tap (< minHold) or another key joined it (fn+arrow, fn+shift).
    case up(cancelled: Bool)
}

/// fn-key push-to-talk gesture. Pure: callers pass flag state and a timestamp.
/// `down` is emitted immediately (no latency); a hold that turns out to be a tap or a
/// key combo is closed with `up(cancelled: true)` so the page can discard it.
struct PttMachine {
    static let minHold: TimeInterval = 0.15

    private enum State {
        case idle
        case held(since: TimeInterval)
        /// fn is physically down but this hold is not ours. Wait for fn up.
        case ignored
    }
    private var state = State.idle

    mutating func flagsChanged(fn: Bool, otherModifiers: Bool, at t: TimeInterval) -> PttEvent? {
        switch (state, fn) {
        case (.idle, true):
            if otherModifiers { state = .ignored; return nil }
            state = .held(since: t)
            return .down
        case (.held, true):
            guard otherModifiers else { return nil }
            state = .ignored
            return .up(cancelled: true)
        case (.held(let since), false):
            state = .idle
            return .up(cancelled: t - since < Self.minHold)
        case (.ignored, false):
            state = .idle
            return nil
        default:
            return nil
        }
    }

    mutating func keyDown() -> PttEvent? {
        guard case .held = state else { return nil }
        state = .ignored
        return .up(cancelled: true)
    }
}
