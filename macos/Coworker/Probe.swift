import Foundation
import WebKit

/// Debug only, launch arg `-probe 1`. Appends the page's real mic track state to /tmp/coworker-probe.log after each
/// event and every second, so a scripted run can show the mic enabled while held and muted on release.
@MainActor
enum Probe {
    static var enabled: Bool { UserDefaults.standard.bool(forKey: "probe") }
    static let path = "/tmp/coworker-probe.log"
    private static var heartbeat: Timer?

    // Remembers every audio track the page opens (the SDK's own track is the one that gets muted).
    static let script = WKUserScript(source: """
        window.__tracks = [];
        const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); s.getAudioTracks().forEach((t) => window.__tracks.push(t)); return s; };
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true)

    private static let snapshotJS = """
        JSON.stringify({vis: document.visibilityState, tracks: (window.__tracks || []).map((t) => t.readyState + ':' + (t.enabled ? 'enabled' : 'muted')),
        ui: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 160)})
        """

    static func start(_ webView: WKWebView) {
        guard enabled else { return }
        heartbeat = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            MainActor.assumeIsolated { snapshot("tick", webView) }
        }
    }

    static func log(_ event: String, _ webView: WKWebView? = nil) {
        guard enabled else { return }
        guard let webView else { return append("\(event)") }
        append(event)
        snapshot("  now", webView)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { snapshot("  +400ms", webView) }
    }

    private static func snapshot(_ label: String, _ webView: WKWebView) {
        webView.evaluateJavaScript(snapshotJS) { result, error in
            MainActor.assumeIsolated { append("\(label) \(result as? String ?? "js error: \(error?.localizedDescription ?? "none")")") }
        }
    }

    private static func append(_ line: String) {
        let stamped = "\(String(format: "%.2f", ProcessInfo.processInfo.systemUptime)) \(line)\n"
        if let h = FileHandle(forWritingAtPath: path) {
            defer { try? h.close() }
            do { try h.seekToEnd(); try h.write(contentsOf: Data(stamped.utf8)) } catch { NSLog("Coworker probe: \(error.localizedDescription)") }
        } else if !FileManager.default.createFile(atPath: path, contents: Data(stamped.utf8)) {
            NSLog("Coworker probe: could not create \(path)")
        }
    }
}
