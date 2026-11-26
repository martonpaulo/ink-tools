// The backups of the write path (#313): before each send, a copy of the tablet's file as the Mac
// last pulled it, in the app's support folder; the newest `limit` per note are kept, so the owner
// can always go back (File › Revert to Backup).
import Foundation

public struct NoteBackups: Sendable {
    /// The owner's number: the 10 newest backups per note (#313).
    public static let standardLimit = 10

    public let folder: URL
    public let limit: Int
    let now: @Sendable () -> Date

    public init(folder: URL, limit: Int = Self.standardLimit, now: @escaping @Sendable () -> Date = { Date() }) {
        self.folder = folder
        self.limit = limit
        self.now = now
    }

    /// The app's own backups folder: Application Support/Ink Notebook Editor/Backups.
    public static func standard(files: FileManager = .default) throws -> NoteBackups {
        let support = try files.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return NoteBackups(folder: support.appending(path: "Ink Notebook Editor/Backups", directoryHint: .isDirectory))
    }

    /// One folder per tablet note, named by its path with every `/` made `_`, so two notes of the
    /// same name in two folders keep apart.
    public func folder(for note: String) -> URL {
        let name = note.split(separator: "/").joined(separator: "_")
        return folder.appending(path: name.isEmpty ? "_" : name, directoryHint: .isDirectory)
    }

    /// Copies `copy` as the newest backup of `note`, then removes all but the `limit` newest.
    @discardableResult
    public func keep(_ copy: URL, for note: String) throws -> URL {
        let files = FileManager.default
        let target = folder(for: note)
        try files.createDirectory(at: target, withIntermediateDirectories: true)
        let stamp = Self.stamp(now())
        var backup = target.appending(path: "\(stamp).note")
        var count = 2
        while files.fileExists(atPath: backup.path(percentEncoded: false)) {
            backup = target.appending(path: "\(stamp)-\(count).note")
            count += 1
        }
        try files.copyItem(at: copy, to: backup)
        for old in try list(for: note).dropFirst(limit) {
            try files.removeItem(at: old)
        }
        return backup
    }

    /// The backups of `note`, newest first; none when it has no folder yet.
    public func list(for note: String) throws -> [URL] {
        let target = folder(for: note)
        guard FileManager.default.fileExists(atPath: target.path(percentEncoded: false)) else { return [] }
        return try FileManager.default.contentsOfDirectory(at: target, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "note" }
            .sorted { Self.order($0.lastPathComponent) > Self.order($1.lastPathComponent) }
    }

    /// A backup's name counts milliseconds.
    static let perSecond: Double = 1000

    /// A name that sorts by time: the milliseconds since 1970, 13 digits until the year 2286.
    static func stamp(_ date: Date) -> String {
        String(format: "%013lld", Int64((date.timeIntervalSince1970 * perSecond).rounded(.down)))
    }

    /// When a backup was taken, from its name; nil for a name the app did not write.
    public static func date(of backup: URL) -> Date? {
        let (stamp, _) = order(backup.lastPathComponent)
        return Int64(stamp).map { Date(timeIntervalSince1970: TimeInterval($0) / perSecond) }
    }

    /// The stamp and the number a same-time backup gets, so `X-10` sorts after `X-9`.
    static func order(_ name: String) -> (String, Int) {
        let base = name.replacingOccurrences(of: ".note", with: "")
        guard let dash = base.lastIndex(of: "-"), let number = Int(base[base.index(after: dash)...]) else {
            return (base, 1)
        }
        return (String(base[..<dash]), number)
    }
}
