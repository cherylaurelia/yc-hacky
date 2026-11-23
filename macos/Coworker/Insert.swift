import AppKit

protocol Clipboard: AnyObject {
    func read() -> String?
    func write(_ text: String?)
}

final class PasteboardClipboard: Clipboard {
    private let pasteboard = NSPasteboard.general

    func read() -> String? { pasteboard.string(forType: .string) }

    func write(_ text: String?) {
        pasteboard.clearContents()
        if let text { pasteboard.setString(text, forType: .string) }
    }
}

/// Types dictated text into the focused app by pasting it, then puts the user's clipboard back.
final class TextInserter {
    struct PasteFailed: Error {}

    private let clipboard: Clipboard
    private let paste: () throws -> Void
    private let later: (@escaping () -> Void) -> Void

    /// `later` runs the restore once the paste has landed: the target app reads the pasteboard asynchronously.
    init(clipboard: Clipboard = PasteboardClipboard(),
         paste: @escaping () throws -> Void = TextInserter.pressCommandV,
         later: @escaping (@escaping () -> Void) -> Void = { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: $0) }) {
        self.clipboard = clipboard
        self.paste = paste
        self.later = later
    }

    func insert(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let previous = clipboard.read()
        clipboard.write(text)
        do {
            try paste()
        } catch {
            NSLog("Coworker: could not paste dictation, so it stays on the clipboard: \(error)")
            return
        }
        later { [clipboard] in clipboard.write(previous) }
    }

    /// Posting key events needs Accessibility; without it macOS drops them silently.
    static func pressCommandV() throws {
        guard AXIsProcessTrusted() else { throw PasteFailed() }
        let source = CGEventSource(stateID: .combinedSessionState)
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: down) else { throw PasteFailed() }  // 9 = V
            event.flags = CGEventFlags.maskCommand
            event.post(tap: CGEventTapLocation.cgAnnotatedSessionEventTap)
        }
    }
}
