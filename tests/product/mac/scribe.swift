// Spec: the wire protocol of ElevenLabs realtime Scribe (wss://api.elevenlabs.io/v1/speech-to-text/realtime).
// Needs macos/Coworker/Scribe.swift: enum ScribeEvent, enum ScribeProtocol { url, audioMessage, parse }.
// The app holds a single-use token (from the server), never the API key.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }

        let u = ScribeProtocol.url(token: "sutkn_abc", sampleRate: 16000)
        let q = Dictionary(uniqueKeysWithValues: (URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        check(u.scheme == "wss" && u.host == "api.elevenlabs.io" && u.path == "/v1/speech-to-text/realtime", "realtime endpoint")
        check(q["token"] == "sutkn_abc", "single-use token in the query, no API key")
        check(q["model_id"] == "scribe_v2_realtime", "realtime model")
        check(q["audio_format"] == "pcm_16000", "audio format follows the sample rate")

        let pcm = Data([1, 2, 3, 250])
        let msg = ScribeProtocol.audioMessage(pcm, sampleRate: 16000, commit: true)
        let j = (try? JSONSerialization.jsonObject(with: Data(msg.utf8))) as? [String: Any] ?? [:]
        check(j["message_type"] as? String == "input_audio_chunk", "audio chunk message type")
        check(j["audio_base_64"] as? String == pcm.base64EncodedString(), "audio is base64")
        check(j["commit"] as? Bool == true && j["sample_rate"] as? Int == 16000, "commit flag and sample rate")

        check(ScribeProtocol.parse(#"{"message_type":"session_started","session_id":"s"}"#) == .started, "session started")
        check(ScribeProtocol.parse(#"{"message_type":"partial_transcript","text":"hel"}"#) == .partial("hel"), "partial")
        check(ScribeProtocol.parse(#"{"message_type":"committed_transcript","text":"hello."}"#) == .committed("hello."), "committed")
        check(ScribeProtocol.parse(#"{"message_type":"committed_transcript_with_timestamps","text":"hi","words":[]}"#) == .committed("hi"), "committed with timestamps")
        check(ScribeProtocol.parse(#"{"message_type":"auth_error","error":"bad token"}"#) == .failed("bad token"), "errors surface their message")
        check(ScribeProtocol.parse(#"{"message_type":"quota_exceeded","error":"out of credits"}"#) == .failed("out of credits"), "quota errors too")
        check(ScribeProtocol.parse("not json") == nil, "garbage is ignored")
        exit(fails == 0 ? 0 : 1)
    }
}
