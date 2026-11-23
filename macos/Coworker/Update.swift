import Foundation

/// Is the version the site publishes newer than this build? Pure, so macos/test.sh can check it without a network.
enum UpdateCheck {
    /// Semver precedence for `1.2.3`, `v1.2.3` and `1.2.3-rc.1` (build metadata is ignored). Anything else is never newer,
    /// so a bad answer from the site cannot nag anyone.
    static func isNewer(_ latest: String, than current: String) -> Bool {
        guard let a = Version(latest), let b = Version(current) else { return false }
        return a > b
    }

    /// `latest` from the `/api/version` body. nil when nothing is published yet (`null` or missing) or it is not a version.
    static func latestVersion(in data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let latest = object["latest"] as? String, Version(latest) != nil else { return nil }
        return latest
    }

    /// The site's origin with `path`, for example `https://host/api/version` from the page the panel shows. nil when the page is not http(s).
    static func endpoint(_ path: String, page: URL) -> URL? {
        guard page.host != nil, ["http", "https"].contains(page.scheme ?? ""),
              var parts = URLComponents(url: page, resolvingAgainstBaseURL: false) else { return nil }
        parts.user = nil
        parts.password = nil
        parts.path = path
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }

    private struct Version: Comparable {
        let core: [Int]
        let pre: [String]

        init?(_ text: String) {
            var s = Substring(text.trimmingCharacters(in: .whitespaces))
            if s.hasPrefix("v") { s = s.dropFirst() }
            s = s.split(separator: "+", maxSplits: 1, omittingEmptySubsequences: false)[0]
            let halves = s.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
            let core = halves[0].split(separator: ".", omittingEmptySubsequences: false).map(Self.number)
            let pre = halves.count > 1 ? halves[1].split(separator: ".", omittingEmptySubsequences: false).map(String.init) : []
            guard core.count == 3, !core.contains(nil), !pre.contains(where: \.isEmpty) else { return nil }
            self.core = core.compactMap { $0 }
            self.pre = pre
        }

        private static func number(_ s: Substring) -> Int? { !s.isEmpty && s.allSatisfy { $0 >= "0" && $0 <= "9" } ? Int(s) : nil }

        static func < (a: Version, b: Version) -> Bool {
            if a.core != b.core { return a.core.lexicographicallyPrecedes(b.core) }
            if a.pre.isEmpty || b.pre.isEmpty { return !a.pre.isEmpty && b.pre.isEmpty }  // 1.0.0-rc.1 comes before 1.0.0
            for (x, y) in zip(a.pre, b.pre) where x != y {
                switch (number(Substring(x)), number(Substring(y))) {
                case let (m?, n?): return m < n
                case (_?, nil): return true  // numeric identifiers sort before alphanumeric ones
                case (nil, _?): return false
                case (nil, nil): return x < y
                }
            }
            return a.pre.count < b.pre.count
        }
    }
}

/// Asks the site for the latest version on launch and every 24 hours, and says so once something newer than this build is out.
@MainActor
final class UpdateChecker {
    var onUpdate: ((String) -> Void)?
    private let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
    private var page: () -> URL = { URL(string: "about:blank")! }
    private var timer: Timer?

    /// `page` is read on every check, because Set URL... can move the app to another site.
    func start(page: @escaping () -> URL) {
        self.page = page
        check()
        timer = Timer.scheduledTimer(withTimeInterval: 24 * 60 * 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.check() }
        }
    }

    private func check() {
        guard let url = UpdateCheck.endpoint("/api/version", page: page()) else { return }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        Task { [weak self] in
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard status == 200 else { NSLog("Coworker: update check got HTTP \(status) from \(url)"); return }
                guard let latest = UpdateCheck.latestVersion(in: data), let self, UpdateCheck.isNewer(latest, than: current) else { return }
                onUpdate?(latest)
            } catch {
                NSLog("Coworker: update check failed: \(error.localizedDescription)")
            }
        }
    }
}
