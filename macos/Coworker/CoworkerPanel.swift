import AppKit
import WebKit

/// Floating non-activating panel hosting the coworker web page.
/// "Hidden" is alpha 0 while still ordered in, so the page keeps running and speaking.
@MainActor
final class CoworkerPanel: NSObject, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private static let visibleKey = "panelVisible"
    var onPageState: ((Phase) -> Void)?
    private let panel: NSPanel
    private let webView: WKWebView
    private var url: URL
    private var retry: DispatchWorkItem?

    var isVisible: Bool { panel.alphaValue > 0 }

    init(url: URL) {
        self.url = url
        let cfg = WKWebViewConfiguration()
        cfg.mediaTypesRequiringUserActionForPlayback = []  // the agent speaks without a click
        webView = WKWebView(frame: .zero, configuration: cfg)
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 520),
                        styleMask: [.titled, .closable, .resizable, .utilityWindow, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        super.init()
        cfg.userContentController.add(self, name: "coworker")
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isInspectable = true
        panel.title = "Coworker"
        panel.contentView = webView
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self
        if !panel.setFrameUsingName("CoworkerPanel"), let s = NSScreen.main?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: s.maxX - 360 - 16, y: s.minY + 16))
        }
        panel.setFrameAutosaveName("CoworkerPanel")
        panel.orderFrontRegardless()
        let d = UserDefaults.standard
        apply(d.object(forKey: Self.visibleKey) == nil || d.bool(forKey: Self.visibleKey))
        load()
    }

    func setVisible(_ visible: Bool) {
        apply(visible)
        UserDefaults.standard.set(visible, forKey: Self.visibleKey)
    }

    private func apply(_ visible: Bool) {
        panel.alphaValue = visible ? 1 : 0
        panel.ignoresMouseEvents = !visible
    }

    func setURL(_ new: URL) { url = new; load() }

    func load() {
        retry?.cancel()
        webView.load(URLRequest(url: url))
    }

    func deliver(_ event: PttEvent) {
        let detail: String
        switch event {
        case .down: detail = "{down:true}"
        case .up(let cancelled): detail = "{down:false,cancelled:\(cancelled)}"
        }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('coworker-ptt',{detail:\(detail)}))") { _, error in
            if let error { NSLog("Coworker: could not deliver ptt event: \(error.localizedDescription)") }
        }
    }

    // Hide instead of close: closing would stop the voice session.
    func windowShouldClose(_ sender: NSWindow) -> Bool { setVisible(false); return false }

    // The page grants itself the mic; macOS still asks once for the app (NSMicrophoneUsageDescription).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // Optional page -> app state: window.webkit.messageHandlers.coworker.postMessage({state:'speaking'})
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let state = (message.body as? [String: Any])?["state"] as? String, let phase = Phase(rawValue: state) else {
            NSLog("Coworker: ignored page message \(message.body)")
            return
        }
        onPageState?(phase)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let msg = error.localizedDescription.replacingOccurrences(of: "<", with: "&lt;")
        webView.loadHTMLString("""
            <body style="font:14px -apple-system;padding:24px;color:#888">
            <b>Can't reach the coworker</b><p>\(url.absoluteString)</p><p>\(msg)</p>
            <p>Start it with <code>npm run dev</code> or pick another address from the menu bar (Set URL...). Retrying every 3s.</p>
            """, baseURL: nil)
        let work = DispatchWorkItem { [weak self] in self?.load() }
        retry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
    }
}
