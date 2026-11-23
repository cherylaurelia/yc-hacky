import AppKit

protocol Clipboard: AnyObject {
    func read() -> String?
    func write(_ text: String?)
    /// Puts back what `read()` saw. The default writes the text back; the real pasteboard restores every type.
    func restore(_ previous: String?)
}

extension Clipboard {
    func restore(_ previous: String?) { write(previous) }
}

final class PasteboardClipboard: Clipboard {
    private let pasteboard = NSPasteboard.general
    private var saved: [NSPasteboardItem] = []  // everything on the clipboard at read(): images, files, rich text, not only its text
    private var written = -1                    // changeCount right after our own write

    func read() -> String? {
        saved = (pasteboard.pasteboardItems ?? []).map { item in
            let copy = NSPasteboardItem()
            for type in item.types { if let data = item.data(forType: type) { copy.setData(data, forType: type) } }
            return copy
        }
        return pasteboard.string(forType: .string)
    }

    func write(_ text: String?) {
        pasteboard.clearContents()
        if let text { pasteboard.setString(text, forType: .string) }
        written = pasteboard.changeCount
    }

    func restore(_ previous: String?) {
        defer { saved = []; written = -1 }
        guard pasteboard.changeCount == written else { return }  // the user copied something since: keep theirs
        pasteboard.clearContents()
        if !saved.isEmpty { pasteboard.writeObjects(saved) }
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
         later: @escaping (@escaping () -> Void) -> Void = { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: $0) }) {
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
        later { [clipboard] in clipboard.restore(previous) }
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
