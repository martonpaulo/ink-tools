import Foundation

/// The app's own folders inside Application Support, named once (#461).
public enum AppFolders {
    /// The bundle identifier, also the name of the folder that holds the copies from the tablet.
    public static let identifier = "com.martonpaulo.inktools.noteeditor"
    /// The folder named for the app: backups and pictures waiting to be inserted.
    public static let named = "Note Editor"

    /// The user's Application Support folder, made when it is missing.
    public static func support(files: FileManager = .default) throws -> URL {
        try files.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    }

    public static func backups(in support: URL) -> URL {
        support.appending(path: "\(named)/Backups", directoryHint: .isDirectory)
    }

    public static func pictures(in support: URL) -> URL {
        support.appending(path: "\(named)/Pictures", directoryHint: .isDirectory)
    }

    public static func fromTablet(in support: URL) -> URL {
        support.appending(path: "\(identifier)/From Tablet", directoryHint: .isDirectory)
    }

    /// The disk the files under `folders` take, for Settings › Tablet (#485, #496): zero for a
    /// folder that does not exist, as nothing is kept there yet, and `nil` when a folder could not
    /// be read, never a size that leaves part of it out.
    public static func bytes(of folders: [URL], files: FileManager = .default) -> Int64? {
        var total: Int64 = 0
        var unreadable = false
        for folder in folders where files.fileExists(atPath: folder.path(percentEncoded: false)) {
            let keys: [URLResourceKey] = [.totalFileAllocatedSizeKey, .isRegularFileKey]
            guard
                let items = files.enumerator(
                    at: folder, includingPropertiesForKeys: keys, options: [],
                    errorHandler: { _, _ in
                        unreadable = true
                        return true
                    })
            else { return nil }
            for case let item as URL in items {
                guard let values = try? item.resourceValues(forKeys: Set(keys)) else {
                    unreadable = true
                    continue
                }
                if values.isRegularFile == true { total += Int64(values.totalFileAllocatedSize ?? 0) }
            }
        }
        return unreadable ? nil : total
    }
}

/// Moves what a build under the app's first name, Ink Notebook Editor, kept to the new names, once
/// (#461): its two Application Support folders and its defaults. The Caches index is not moved;
/// it is made again from the note.
public enum LegacyNames {
    public static let identifier = "com.martonpaulo.inktools.notebookeditor"
    public static let named = "Ink Notebook Editor"

    /// What one migration did with each old place.
    public enum Outcome: Equatable, Sendable {
        /// Nothing under the old name: a first launch, or already migrated.
        case nothingToMove
        case moved
        /// The new place already exists, so the old one stays as it is.
        case keptBoth
        case failed(String)
    }

    public struct Report: Equatable, Sendable {
        public var named: Outcome
        public var identifier: Outcome
        public var defaults: Outcome

        public init(named: Outcome, identifier: Outcome, defaults: Outcome) {
            self.named = named
            self.identifier = identifier
            self.defaults = defaults
        }
    }

    /// Moves `support/Ink Notebook Editor` and `support/<old identifier>` to their new names when
    /// the new one is missing, and copies the old defaults domain into `newDomain` when that one
    /// has no values. Never deletes or overwrites.
    public static func migrate(
        support: URL, defaults: UserDefaults = .standard, newDomain: String = AppFolders.identifier,
        oldDomain: String = identifier, files: FileManager = .default
    ) -> Report {
        Report(
            named: move(support.appending(path: named), to: support.appending(path: AppFolders.named), files: files),
            identifier: move(
                support.appending(path: identifier), to: support.appending(path: AppFolders.identifier), files: files),
            defaults: copyDomain(from: oldDomain, to: newDomain, in: defaults))
    }

    static func move(_ old: URL, to new: URL, files: FileManager) -> Outcome {
        guard files.fileExists(atPath: old.path) else { return .nothingToMove }
        guard !files.fileExists(atPath: new.path) else { return .keptBoth }
        do {
            try files.moveItem(at: old, to: new)
            return .moved
        } catch {
            return .failed("\(old.lastPathComponent): \(error.localizedDescription)")
        }
    }

    static func copyDomain(from old: String, to new: String, in defaults: UserDefaults) -> Outcome {
        guard let values = defaults.persistentDomain(forName: old), !values.isEmpty else { return .nothingToMove }
        if let current = defaults.persistentDomain(forName: new), !current.isEmpty { return .keptBoth }
        defaults.setPersistentDomain(values, forName: new)
        return .moved
    }
}
