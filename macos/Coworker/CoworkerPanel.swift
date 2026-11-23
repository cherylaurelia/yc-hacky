import AppKit
import WebKit

/// Floating non-activating panel hosting the coworker web page. It starts hidden: the pill is the default face.
/// "Hidden" is alpha 0 while still ordered in, so the page keeps running and speaking.
@MainActor
final class CoworkerPanel: NSObject, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var onPageMessage: ((PageMessage) -> Void)?
    /// The page answered an agent's request: window.webkit.messageHandlers.coworker.postMessage({answer:{id, text}}).
    var onAnswer: ((String, String) -> Void)?
    var onVisibilityChange: ((Bool) -> Void)?
    private let panel: NSPanel
    private let webView: WKWebView
    private var url: URL
    private var retry: DispatchWorkItem?
    private var talkKey = ""
    private var pageReady = false

    var isVisible: Bool { panel.alphaValue > 0 }

    init(url: URL) {
        self.url = url
        let cfg = WKWebViewConfiguration()
        cfg.mediaTypesRequiringUserActionForPlayback = []  // the agent speaks without a click
        if Probe.enabled { cfg.userContentController.addUserScript(Probe.script) }
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
        setVisible(UserDefaults.standard.bool(forKey: "showPanel"))  // launch arg -showPanel 1
        load()
        Probe.start(webView)
    }

    func setVisible(_ visible: Bool) {
        panel.alphaValue = visible ? 1 : 0
        panel.ignoresMouseEvents = !visible
        onVisibilityChange?(visible)
    }

    func setURL(_ new: URL) { url = new; load() }

    /// A single-use dictation token, fetched by the page itself so the request carries its sign-in cookie and Origin.
    func scribeToken() async throws -> String {
        let js = """
        const r = await fetch("/api/scribe-token", { method: "POST", credentials: "same-origin" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.token) throw new Error(j.error || `HTTP ${r.status}`);
        return j.token;
        """
        guard let token = try await webView.callAsyncJavaScript(js, contentWorld: .page) as? String, !token.isEmpty else {
            throw NSError(domain: "Scribe", code: 0, userInfo: [NSLocalizedDescriptionKey: "the page gave no dictation token"])
        }
        return token
    }

    func load() {
        retry?.cancel()
        webView.load(URLRequest(url: url))
    }

    /// Tells the page which key to hint: window event `coworker-ptt-key` with detail {key:"Right Option"}.
    /// Sent on every change, after each page load, and again on the page's first message (the page's listener only exists once it has hydrated).
    func sendTalkKey(_ name: String? = nil) {
        if let name { talkKey = name }
        guard !talkKey.isEmpty else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('coworker-ptt-key',{detail:{key:'\(talkKey)'}}))") { _, error in
            if let error { NSLog("Coworker: could not deliver talk key: \(error.localizedDescription)") }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = false
        sendTalkKey()
    }

    /// Hands an agent's event (kind, text, id, ...) to the page as window event `coworker-relay`; the page answers with `{answer:{id,text}}`.
    func deliverRelay(_ json: String) {
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent(\"coworker-relay\",{detail:\(json)}))") { _, error in
            if let error { NSLog("Coworker: could not deliver relay event: \(error.localizedDescription)") }
        }
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
        Probe.log("ptt \(detail)", webView)
    }

    // Hide instead of close: closing would stop the voice session.
    func windowShouldClose(_ sender: NSWindow) -> Bool { setVisible(false); return false }

    // The page grants itself the mic; macOS still asks once for the app (NSMicrophoneUsageDescription).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // Page -> app: window.webkit.messageHandlers.coworker.postMessage({state:'speaking', alert:{agent, text}})
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if let a = (message.body as? [String: Any])?["answer"] as? [String: Any], let id = a["id"] as? String, let text = a["text"] as? String, !text.isEmpty {
            onAnswer?(id, text)
            return
        }
        guard let msg = PageMessage.parse(message.body) else {
            NSLog("Coworker: ignored page message \(message.body)")
            return
        }
        Probe.log("page \(message.body)", webView)
        if !pageReady {
            pageReady = true
            sendTalkKey()
        }
        onPageMessage?(msg)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        webView.loadHTMLString(OfflinePage.html(url: url, reason: error.localizedDescription), baseURL: nil)
        let work = DispatchWorkItem { [weak self] in self?.load() }
        retry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
    }
}
