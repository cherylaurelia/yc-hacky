import Foundation

/// Shown in the panel when the page fails to load, so it is never blank.
enum OfflinePage {
    /// Retry is a plain link to the page itself, so it needs no script and no native handler.
    static func html(url: URL, reason: String) -> String {
        """
        <!doctype html><meta name="color-scheme" content="light dark">
        <body style="font:14px -apple-system;padding:24px;line-height:1.5">
        <b>Can't reach the coworker</b>
        <p style="color:gray">\(escape(reason))</p>
        <p><a href="\(escape(url.absoluteString))" style="display:inline-block;padding:6px 14px;border-radius:6px;background:#0a84ff;color:white;text-decoration:none">Retry</a></p>
        <p style="color:gray;font-size:12px">\(escape(url.absoluteString))<br>Retrying every few seconds. To use another address, pick Set URL... in the menu bar.</p>
        """
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
}
