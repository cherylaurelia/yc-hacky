import Foundation

// Logic for the update check: version order, the /api/version body, and where the check goes. Build and run with macos/test.sh
@main
struct UpdateLogicTest {
    static var failed = 0

    static func check<T: Equatable>(_ name: String, _ got: T, _ want: T) {
        if got == want { print("ok   \(name)") }
        else { failed += 1; print("FAIL \(name)\n  want \(want)\n  got  \(got)") }
    }

    static func newer(_ pairs: [(String, String)]) -> [Bool] { pairs.map { UpdateCheck.isNewer($0.0, than: $0.1) } }

    static func endpoint(_ path: String, _ page: String) -> String? { UpdateCheck.endpoint(path, page: URL(string: page)!)?.absoluteString }

    static func latest(_ json: String) -> String? { UpdateCheck.latestVersion(in: Data(json.utf8)) }

    static func main() {
        check("a higher patch, minor or major is newer", newer([("0.2.1", "0.2.0"), ("0.3.0", "0.2.9"), ("1.0.0", "0.9.9")]), [true, true, true])
        check("the same or an older version is not", newer([("0.2.0", "0.2.0"), ("0.1.9", "0.2.0"), ("0.9.9", "1.0.0")]), [false, false, false])
        check("numbers compare as numbers, not text", newer([("0.10.0", "0.9.0"), ("0.2.10", "0.2.9"), ("0.9.0", "0.10.0")]), [true, true, false])
        check("a v prefix and build metadata do not matter", newer([("v0.3.0", "0.2.0"), ("0.3.0+7", "0.2.0"), ("0.2.0+9", "0.2.0")]), [true, true, false])

        check("a release is newer than its own prerelease", newer([("1.0.0", "1.0.0-rc.1"), ("1.0.0-rc.1", "1.0.0")]), [true, false])
        check("prerelease identifiers follow semver", newer([("1.0.0-rc.2", "1.0.0-rc.1"), ("1.0.0-rc.10", "1.0.0-rc.2"), ("1.0.0-beta", "1.0.0-alpha"),
                                                              ("1.0.0-beta.1", "1.0.0-beta"), ("1.0.0-rc.1", "1.0.0-beta.9"), ("1.0.0-alpha", "1.0.0-1")]),
              [true, true, true, true, true, true])
        check("a prerelease of a higher version beats the lower release", newer([("0.3.0-rc.1", "0.2.0")]), [true])

        check("anything that is not a version is never newer", newer([("", "0.2.0"), ("latest", "0.2.0"), ("1.2", "0.2.0"), ("1.2.3.4", "0.2.0"), ("1.x.0", "0.2.0"),
                                                                      ("-1.0.0", "0.2.0"), ("1.0.0-", "0.2.0"), ("1..0", "0.2.0")]),
              [false, false, false, false, false, false, false, false])
        check("a dev build with no version is never told to update", newer([("0.3.0", "dev"), ("0.3.0", "")]), [false, false])

        check("the version comes from the latest key", [latest(#"{"latest":"0.3.0","url":"https://x/y.dmg","sha256":"ab"}"#), latest(#"{"latest":"v1.0.0-rc.1"}"#)], ["0.3.0", "v1.0.0-rc.1"])
        check("nothing published reads as no version", [latest(#"{"latest":null}"#), latest("{}"), latest("")], [nil, nil, nil])
        check("a body that is not a version reads as no version", [latest("<html>502</html>"), latest("[]"), latest(#"{"latest":3}"#), latest(#"{"latest":"soon"}"#)], [nil, nil, nil, nil])

        check("the check goes to the site's origin", endpoint("/api/version", "https://abc.mtm.sh/app?embed=1"), "https://abc.mtm.sh/api/version")
        check("a port is kept, a query and fragment are dropped", endpoint("/download", "http://localhost:3000/app?repo=a/b&embed=1#x"), "http://localhost:3000/download")
        check("credentials are dropped", endpoint("/api/version", "https://me:pw@abc.mtm.sh/app"), "https://abc.mtm.sh/api/version")
        check("a page that is not http(s) has no site to ask", [endpoint("/api/version", "about:blank"), endpoint("/api/version", "file:///tmp/ptt-test.html")], [nil, nil])

        print(failed == 0 ? "all update logic checks passed" : "\(failed) update logic check(s) FAILED")
        exit(failed == 0 ? 0 : 1)
    }
}
