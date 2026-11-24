import Foundation

enum AppConfig {
    /// The hosted Coworker page. Embedded mode drops the page's own chrome; the repo comes from the page's sign-in, not from the app.
    static let defaultPage = URL(string: "https://40984690-ad84-41e4-86fe-718bb67011bb.mtm.sh/app?embed=1")!
}
