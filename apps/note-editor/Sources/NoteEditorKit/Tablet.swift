// What the tablet's shared storage holds, as `inkctl --json files ls` prints it, and where a copy
// pulled from it lives on the Mac (#262).
import Foundation

/// One folder or note in a listing of the tablet's shared storage.
public struct TabletEntry: Sendable, Equatable, Identifiable, Decodable {
    public enum Kind: String, Sendable, Decodable {
        case dir, file
    }

    public let name: String
    public let type: Kind
    public let bytes: Int
    public let modified: String

    public var id: String { name }
    public var isFolder: Bool { type == .dir }

    public init(name: String, type: Kind, bytes: Int, modified: String) {
        self.name = name
        self.type = type
        self.bytes = bytes
        self.modified = modified
    }
}

/// A folder of the tablet as `inkctl --json files ls PATH` prints it.
public struct TabletListing: Sendable, Equatable, Decodable {
    /// The notes folder of the shared storage, where the tablet keeps every notebook.
    public static let notesFolder = "Note"
    public static let noteExtension = "note"

    public let path: String
    public let entries: [TabletEntry]

    public init(path: String, entries: [TabletEntry]) {
        self.path = path
        self.entries = entries
    }

    /// Decodes inkctl's JSON, keeping only folders and `.note` files: folders first, then notes,
    /// each by name as Finder sorts it. Anything that is not that JSON throws.
    public static func parse(_ data: Data) throws -> TabletListing {
        let raw = try JSONDecoder().decode(TabletListing.self, from: data)
        let kept = raw.entries.filter { $0.isFolder || isNote($0.name) }
        let sorted = kept.sorted { left, right in
            if left.isFolder != right.isFolder { return left.isFolder }
            return left.name.localizedStandardCompare(right.name) == .orderedAscending
        }
        return TabletListing(path: raw.path, entries: sorted)
    }

    public static func isNote(_ name: String) -> Bool {
        (name as NSString).pathExtension.caseInsensitiveCompare(noteExtension) == .orderedSame
    }
}

/// Where the Mac keeps the copy of a tablet note: one local file per tablet path, under the app's
/// own Application Support folder, so a second pull of a note replaces its first copy.
public struct TabletCopyLocation: Sendable, Equatable {
    public let root: URL

    public init(root: URL) {
        self.root = root
    }

    /// The local file for `tabletPath`, relative to the shared storage or absolute under
    /// `/storage/emulated/0`. Any other absolute path, a path that climbs out with `..`, or an empty
    /// one gives nil.
    public func localURL(for tabletPath: String) -> URL? {
        var path = tabletPath
        if path.hasPrefix("/") {
            guard path.hasPrefix(Self.sharedStorage + "/") else { return nil }
            path.removeFirst(Self.sharedStorage.count)
        }
        let parts = path.split(separator: "/").map(String.init)
        guard !parts.isEmpty, !parts.contains(where: { $0 == ".." || $0 == "." }) else { return nil }
        return parts.reduce(root) { $0.appending(path: $1, directoryHint: .notDirectory) }
    }

    /// The tablet path a local copy came from, relative to the shared storage, as `localURL`
    /// makes it; nil for a file outside the copies folder, which is not a tablet note (#315).
    public func tabletPath(for local: URL) -> String? {
        let base = root.standardizedFileURL.pathComponents
        let parts = local.standardizedFileURL.pathComponents
        guard parts.count > base.count, Array(parts.prefix(base.count)) == base else { return nil }
        let path = parts.dropFirst(base.count).joined(separator: "/")
        return localURL(for: path) == nil ? nil : path
    }

    /// The tablet's shared storage, where inkctl's relative paths start.
    public static let sharedStorage = "/storage/emulated/0"

    /// Other spellings of the shared storage, as the note app may answer a note opened under one
    /// (inkctl's `SHARED_ALIASES`).
    static let sharedAliases = ["/sdcard", "/mnt/sdcard", "/storage/self/primary"]

    /// `path` in the one spelling the helper answers: absolute under `sharedStorage`. A relative
    /// path, as `tabletPath(for:)` makes it, starts there; an alias is resolved. Two spellings of
    /// one note compare equal only after this (#316).
    public static func sharedPath(_ path: String) -> String {
        guard path.hasPrefix("/") else { return sharedStorage + "/" + path }
        for alias in sharedAliases where path == alias || path.hasPrefix(alias + "/") {
            return sharedStorage + path.dropFirst(alias.count)
        }
        return path
    }
}
