// The Mac's copy as each queued edit saw it (#317): when the tablet's note moved on before the
// edit is sent, the edit is re-targeted from this copy, or this copy becomes the conflict note.
import Foundation

/// Copies of the Mac's copy, one per base hash, in a temporary folder the sender removes.
public struct BaseSnapshots: Sendable {
    let folder: URL

    public init(folder: URL) {
        self.folder = folder
    }

    /// Copies `copy` aside under its hash, once, and answers the hash. The copy is read once, so
    /// the snapshot is the bytes the hash names even while a send replaces the copy.
    public func keep(_ copy: URL, hash: (URL) throws -> String) throws -> String {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let read = folder.appending(path: "reading-\(UUID().uuidString).note")
        try FileManager.default.copyItem(at: copy, to: read)
        let found = try hash(read)
        let kept = place(of: found)
        if FileManager.default.fileExists(atPath: kept.path(percentEncoded: false)) {
            try FileManager.default.removeItem(at: read)
        } else {
            try FileManager.default.moveItem(at: read, to: kept)
        }
        return found
    }

    /// The snapshot of `hash`, nil when none was kept.
    public func file(for hash: String) -> URL? {
        let kept = place(of: hash)
        return FileManager.default.fileExists(atPath: kept.path(percentEncoded: false)) ? kept : nil
    }

    /// Removes every snapshot whose hash is not in `kept`.
    public func drop(except kept: Set<String>) {
        let names = Set(kept.map { place(of: $0).lastPathComponent })
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        for file in files where !names.contains(file.lastPathComponent) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    /// Removes the folder, when the editor closes.
    public func removeAll() {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A hash names its file by the hex of its bytes, so no base can name a path outside the folder.
    private func place(of hash: String) -> URL {
        folder.appending(path: "base-\(hash.utf8.map { String(format: "%02x", $0) }.joined()).note")
    }
}
