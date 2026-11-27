/// The one failure value of the Swift adapter for a Supernote internal (#294, docs/architecture.md ›
/// Layer rules, «A failure reads as a sentence»), as sn-adapter's src/failure.ts defines it: the
/// person sees one sentence, chosen by a copy key; the agent's log carries the registry item, the
/// method, the firmware, the app versions and the whole cause chain.
public struct InternalFailure: Error, CustomStringConvertible {
    /// What the log says for a firmware or an app version that could not be read. The Mac reads a
    /// note file, not the tablet, so a failure here has neither unless the caller gives them.
    public static let unread = "unread"

    /// The person's sentence for each copy key.
    public static let copy: [String: String] = [
        "turnedOff":
            "Note Editor cannot open notebooks in this version because a tablet update changed the notebook format, so update Ink Tools to open them again."
    ]

    public let item: Registry.Item
    /// The operation that failed, in our words, such as `readNote`.
    public let method: String
    public let copyKey: String
    public let firmware: String
    public let apps: [(String, String)]
    public let cause: (any Error)?

    /// The failure of `item`; a copy key with no sentence is a bug, so it stops.
    public init(
        item: Registry.Item, method: String, copyKey: String, firmware: String = unread,
        apps: [(String, String)] = [], cause: (any Error)?
    ) {
        precondition(Self.copy[copyKey] != nil, "no copy for \(copyKey)")
        self.item = item
        self.method = method
        self.copyKey = copyKey
        self.firmware = firmware
        self.apps = apps
        self.cause = cause
    }

    /// The person's sentence.
    public var description: String { Self.copy[copyKey] ?? "" }

    /// One header line of every field, then each cause, outermost first.
    public var agentLog: String {
        let versions = apps.map { "\($0.0)@\($0.1)" }.joined(separator: ",")
        let header = [
            "registry=\(item.id)", "level=\(item.level)", "owner=\(item.owner)", "active=\(item.active)",
            "method=\(method)", "firmware=\(firmware)", "apps=\(versions.isEmpty ? Self.unread : versions)",
        ].joined(separator: " ")
        var lines = [header]
        var current: (any Error)? = cause
        while let error = current {
            lines.append("cause \(type(of: error)): \(error)")
            current = (error as? InternalFailure)?.cause
        }
        return lines.joined(separator: "\n")
    }
}

/// A module whose kill switch is off (#293): the cause of its failure, with the switch's reason.
public struct ModuleOff: Error, CustomStringConvertible {
    public let reason: String

    public init(reason: String) {
        self.reason = reason
    }

    public var description: String { "turned off \(reason)" }
}

extension Registry {
    /// Item `id`; an id the registry does not hold is a bug, so it stops.
    static func item(_ id: String, in items: [Item] = Registry.items) -> Item {
        guard let item = items.first(where: { $0.id == id }) else {
            preconditionFailure("no registry item \(id)")
        }
        return item
    }

    /// Before acting (#293): throws when the item's kill switch is off, so the module does nothing.
    static func requireOn(_ item: Item, method: String) throws {
        if let reason = item.off {
            throw InternalFailure(item: item, method: method, copyKey: "turnedOff", cause: ModuleOff(reason: reason))
        }
    }
}
