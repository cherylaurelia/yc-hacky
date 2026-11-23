import Foundation

/// Starts, lists and stops coding agents (`coworker run`) for the page. Each runs in its own worktree and opens a PR.
enum AgentRunner {
    /// Through a login shell, so claude, codex and gh are on PATH as in the user's terminal (GUI apps don't get it).
    /// The task is its own argv element after `--`: the shell script is fixed and never sees it.
    static func arguments(cli: String, task: String, agent: String, repo: String) -> [String] {
        ["/bin/zsh", "-lc", "exec \"$0\" \"$@\"", cli, "run", "--detach", "--agent", agent, "--repo", repo, "--", task]
    }

    private static var cli: String { (Bundle.main.resourcePath ?? "") + "/bin/coworker" }
    private static func shell(_ args: String...) -> [String] { ["/bin/zsh", "-lc", "exec \"$0\" \"$@\"", cli] + args }

    static func start(task: String, agent: String, repo: String) async -> [String: Any] {
        let task = task.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !task.isEmpty else { return ["error": "I need the task."] }
        guard repo.range(of: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"#, options: .regularExpression) != nil else {
            return ["error": "Open a repo first, so the agent knows where to work."]
        }
        let r = await run(arguments(cli: cli, task: task, agent: agent == "codex" ? "codex" : "claude", repo: repo))
        guard r.status == 0, let id = r.out.split(whereSeparator: \.isWhitespace).first else { return ["error": failure(r, "coworker run")] }
        return ["id": String(id)]
    }

    /// The `runs` list, newest first: [{id, task, agent, state, pr?}], or {error} so the page never says "none" by mistake.
    static func list() async -> Any {
        let r = await run(shell("runs"))
        guard r.status == 0, let runs = try? JSONSerialization.jsonObject(with: Data(r.out.utf8)) as? [Any] else {
            return ["error": failure(r, "coworker runs")]
        }
        return runs
    }

    /// The interactive shell's PATH, printed between markers because rc files may print around it.
    static func parsePath(_ output: String) -> String? {
        let parts = output.components(separatedBy: "__CW_PATH__")
        guard parts.count >= 3, !parts[1].isEmpty else { return nil }
        return parts[1]
    }

    /// Read once: `zsh -l` skips ~/.zshrc, where tools like claude are often put on PATH, so ask an interactive shell.
    private static let userPath: String? = {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-ilc", "printf '__CW_PATH__%s__CW_PATH__' \"$PATH\""]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = FileHandle.nullDevice
        p.standardInput = FileHandle.nullDevice
        do { try p.run() } catch { return nil }
        DispatchQueue.global().asyncAfter(deadline: .now() + 5) { if p.isRunning { p.terminate() } }  // an rc file that waits must not stall every run
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return parsePath(String(decoding: data, as: UTF8.self))
    }()

    static func stop(id: String) async -> [String: Any] {
        guard id.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil else { return ["error": "That is not a run id."] }
        let r = await run(shell("stop", id))
        return r.status == 0 ? ["ok": true] : ["error": failure(r, "coworker stop")]
    }

    private static func failure(_ r: (status: Int32, out: String, err: String), _ what: String) -> String {
        let err = r.err.trimmingCharacters(in: .whitespacesAndNewlines)
        return err.isEmpty ? "\(what) failed (exit \(r.status))." : String(err.suffix(300))
    }

    private static func run(_ args: [String]) async -> (status: Int32, out: String, err: String) {
        await withCheckedContinuation { done in
            DispatchQueue.global().async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: args[0])
                p.arguments = Array(args.dropFirst())
                if let path = userPath { p.environment = ProcessInfo.processInfo.environment.merging(["PATH": path]) { $1 } }
                let out = Pipe(), err = Pipe()
                p.standardOutput = out
                p.standardError = err
                do { try p.run() } catch { return done.resume(returning: (-1, "", error.localizedDescription)) }
                // Read both pipes before waiting, so a chatty child can't block on a full pipe.
                var errData = Data()
                let group = DispatchGroup()
                group.enter()
                DispatchQueue.global().async { errData = err.fileHandleForReading.readDataToEndOfFile(); group.leave() }
                let outData = out.fileHandleForReading.readDataToEndOfFile()
                group.wait()
                p.waitUntilExit()
                done.resume(returning: (p.terminationStatus, String(decoding: outData, as: UTF8.self), String(decoding: errData, as: UTF8.self)))
            }
        }
    }
}
