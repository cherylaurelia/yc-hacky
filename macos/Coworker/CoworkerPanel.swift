import AppKit
import WebKit

/// Floating non-activating panel hosting the coworker web page. It starts hidden: the pill is the default face.
/// "Hidden" is alpha 0 while still ordered in, so the page keeps running and speaking.
@MainActor
final class CoworkerPanel: NSObject, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
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
        // Requests the page awaits (start, list, stop agents): window.webkit.messageHandlers.coworkerAsync.postMessage(...) -> Promise
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "coworkerAsync")
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
        // Agent commands and diffs only go to the Coworker page, never a site a link navigated to.
        guard let current = webView.url, isCoworker(scheme: current.scheme, host: current.host, port: current.port) else { return }
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
        decisionHandler(isCoworker(origin) ? .grant : .prompt)
    }

    /// True for the configured Coworker page's origin. Default ports are 0 in WKSecurityOrigin and nil in URL.
    private func isCoworker(scheme: String?, host: String?, port: Int?) -> Bool {
        let norm = { (p: Int?) -> Int? in p == nil || p == 0 || p == 443 || p == 80 ? nil : p }
        return scheme == url.scheme && host?.lowercased() == url.host?.lowercased() && norm(port) == norm(url.port)
    }

    private func isCoworker(_ origin: WKSecurityOrigin) -> Bool {
        isCoworker(scheme: origin.protocol, host: origin.host, port: origin.port)
    }

    // Page -> app, awaited: {agent: {op: "start", task, agent, repo} | {op: "list"} | {op: "stop", id}}.
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        // Starting code-writing agents on this Mac is only for the Coworker page's own top frame.
        guard message.frameInfo.isMainFrame, isCoworker(message.frameInfo.securityOrigin) else {
            return replyHandler(nil, "Only the Coworker page can start agents.")
        }
        guard let a = (message.body as? [String: Any])?["agent"] as? [String: Any], let op = a["op"] as? String else {
            return replyHandler(nil, "Unknown request.")
        }
        let text = { (k: String) in a[k] as? String ?? "" }
        Task { @MainActor in
            switch op {
            case "start": replyHandler(await AgentRunner.start(task: text("task"), agent: text("agent"), repo: text("repo")), nil)
            case "list": replyHandler(await AgentRunner.list(), nil)  // the runs, newest first
            case "stop": replyHandler(await AgentRunner.stop(id: text("id")), nil)
            default: replyHandler(nil, "Unknown agent request \(op).")
            }
        }
    }

    // Page -> app: window.webkit.messageHandlers.coworker.postMessage({state:'speaking', alert:{agent, text}})
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if let a = (message.body as? [String: Any])?["answer"] as? [String: Any], let id = a["id"] as? String, let text = a["text"] as? String, !text.isEmpty {
            // Approving an agent's command is only for the Coworker page's own top frame.
            guard message.frameInfo.isMainFrame, isCoworker(message.frameInfo.securityOrigin) else {
                NSLog("Coworker: ignored an answer from \(message.frameInfo.securityOrigin.host)")
                return
            }
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
