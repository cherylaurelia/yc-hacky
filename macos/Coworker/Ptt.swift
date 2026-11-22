import Foundation

enum PttEvent: Equatable {
    case down
    /// cancelled: the hold was a tap (< minHold) or another key joined it (key+arrow, key+shift).
    case up(cancelled: Bool)
}

/// NSEvent.ModifierFlags raw values (generic) and IOKit NX_DEVICE* masks (per side).
private enum Bit {
    static let shift: UInt = 1 << 17, control: UInt = 1 << 18, option: UInt = 1 << 19, command: UInt = 1 << 20, function: UInt = 1 << 23
    static let leftControl: UInt = 0x1, rightControl: UInt = 0x2000
    static let leftOption: UInt = 0x20, rightOption: UInt = 0x40
    static let leftCommand: UInt = 0x8, rightCommand: UInt = 0x10
}

/// The key that is held to talk. Each case knows its keyCode and which bits of the raw modifier flags
/// say it is down. A side-specific modifier uses the device-dependent bits (NX_DEVICE*KEYMASK), because the
/// generic .option/.command/.control flags stay set while the other side is held.
enum TalkKey: String, CaseIterable {
    case fn, rightOption, rightCommand, rightControl

    var title: String {
        switch self {
        case .fn: "fn"
        case .rightOption: "Right Option"
        case .rightCommand: "Right Command"
        case .rightControl: "Right Control"
        }
    }

    var keyCode: UInt16 {
        switch self {
        case .fn: 63
        case .rightOption: 61
        case .rightCommand: 54
        case .rightControl: 62
        }
    }

    /// Raw flags a keyboard reports while only this key is held.
    var downFlags: UInt {
        switch self {
        case .fn: Bit.function
        case .rightOption: Bit.option | Bit.rightOption
        case .rightCommand: Bit.command | Bit.rightCommand
        case .rightControl: Bit.control | Bit.rightControl
        }
    }

    /// `down`: this exact key is held. `others`: any other modifier is held, including the left twin
    /// of a right-side key, so a shortcut like left-Option+Right-Option never talks.
    func sample(rawFlags f: UInt) -> (down: Bool, others: Bool) {
        let all = Bit.shift | Bit.control | Bit.option | Bit.command
        switch self {
        case .fn:
            return (f & Bit.function != 0, f & all != 0)
        case .rightOption:
            return (f & Bit.rightOption != 0, f & (all & ~Bit.option) != 0 || f & Bit.leftOption != 0)
        case .rightCommand:
            return (f & Bit.rightCommand != 0, f & (all & ~Bit.command) != 0 || f & Bit.leftCommand != 0)
        case .rightControl:
            return (f & Bit.rightControl != 0, f & (all & ~Bit.control) != 0 || f & Bit.leftControl != 0)
        }
    }

    /// Wispr Flow holds fn by default, so a Mac with it installed starts on Right Option.
    static func defaultKey(wisprInstalled: Bool) -> TalkKey { wisprInstalled ? .rightOption : .fn }
}

/// Push-to-talk gesture for one held key. Pure: callers pass key state and a timestamp.
/// `down` is emitted immediately (no latency); a hold that turns out to be a tap or a
/// key combo is closed with `up(cancelled: true)` so the page can discard it.
struct PttMachine {
    static let minHold: TimeInterval = 0.15

    private enum State {
        case idle
        case held(since: TimeInterval)
        /// the key is physically down but this hold is not ours. Wait for key up.
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
