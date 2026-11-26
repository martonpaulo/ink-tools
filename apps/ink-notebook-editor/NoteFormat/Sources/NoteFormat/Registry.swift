// The registry of Supernote internals this app reads. Written by scripts/registry.py from registry/ (#294); never edit it by hand.

/// The registry's version, items and values.
public enum Registry {
    public static let version = "2026.11.25"

    /// One registry item: docs/architecture.md › Layer rules gives the levels.
    public struct Item: Sendable, Equatable {
        public let id: String
        public let level: Int
        public let impact: String
        public let owner: String
        /// The probe's name; nil when the item is unprobed.
        public let probe: String?
        /// Why no safe probe exists yet; nil when the item has a probe.
        public let unprobed: String?
        public let active: String
        /// The kill switch: why the module is off and until when it is reviewed; nil when it is on (#293).
        public let off: String?
    }

    public static let items: [Item] = [
        Item(id: "notefile.format-versions", level: 2, impact: "user", owner: "ink-notebook-editor", probe: nil, unprobed: "#293 adds a parse of a fixture note per firmware", active: "ink-notebook-editor NoteFile.swift", off: nil),
        Item(id: "notefile.writer-byte-edit", level: 5, impact: "user", owner: "ink-notebook-editor", probe: nil, unprobed: "a written note is checked by opening it on the tablet", active: "ink-notebook-editor NoteWriter.swift", off: nil),
    ]

    /// The .note format and the versions the reader accepts (notefile.format-versions).
    public enum NotefileFormatVersions {
        public static let signaturePrefix: String = "SN_FILE_VER_"
        public static let knownVersions: [Int] = [20200001, 20200005, 20200006, 20200007, 20200008, 20210009, 20210010, 20220011, 20220013, 20230014, 20230015, 20260016]
        public static let firstGreyscaleVersion: Int = 20230015
        public static let recognitionBoxDotsPerInch: Int = 300
        public static let pictureKind: String = "bitmap"
        public static let strokeDocument: String = "superNoteNote"
        public static let eraserColour: Int = 255
        public static let textBoxKind: String = "0000"
        public static let headingKind: String = "0001"
        public static let headingStyles: [String] = ["1000254", "1000000", "1157254", "1201000"]
    }

    /// NoteWriter edits a .note file's bytes in place (notefile.writer-byte-edit).
    public enum NotefileWriterByteEdit {
        public static let tailMarker: String = "tail"
        public static let pageKeyPrefixes: [String] = ["TITLE_", "KEYWORD_", "LINKO_", "LINKI_"]
    }
}
