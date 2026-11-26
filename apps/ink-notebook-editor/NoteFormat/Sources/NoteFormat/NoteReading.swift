/// The `.note` reader's port (#294, docs/architecture.md › Layer rules): reading a notebook, in our
/// words, with one implementation per level. The registry item `notefile.format-versions` names
/// the one in use by its `active` text; a part moved to a higher level adds its implementation to
/// `NoteReader.implementations` and the item's `active` changes, never a caller.
public protocol NoteReading: Sendable {
    func read(bytes: [UInt8]) throws -> NoteFile
}

/// Level 2: the note file format itself, parsed byte by byte.
public struct FormatReader: NoteReading {
    /// This implementation's name, as the registry item's `active` gives it.
    public static let name = "ink-notebook-editor NoteFile.swift"

    public init() {}

    public func read(bytes: [UInt8]) throws -> NoteFile {
        try NoteFile(parsing: bytes)
    }
}

public enum NoteReader {
    static let itemId = "notefile.format-versions"
    static let implementations: [String: any NoteReading] = [FormatReader.name: FormatReader()]

    /// The implementation the registry names, checking the item's kill switch before each read
    /// (#293). An item with no implementation of its `active` name stops: no other one is taken.
    static func port(items: [Registry.Item] = Registry.items,
                     implementations: [String: any NoteReading] = implementations) -> any NoteReading {
        let item = Registry.item(itemId, in: items)
        guard let chosen = implementations[item.active] else {
            preconditionFailure("no implementation of \(item.id) for its active \(item.active)")
        }
        return Switched(item: item, reader: chosen)
    }

    private struct Switched: NoteReading {
        let item: Registry.Item
        let reader: any NoteReading

        func read(bytes: [UInt8]) throws -> NoteFile {
            try Registry.requireOn(item, method: "readNote")
            return try reader.read(bytes: bytes)
        }
    }
}
