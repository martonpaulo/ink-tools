import NoteFormat
import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// A tablet notebook. The format is Ratta's, so the app imports the type rather than owning
    /// it; Support/Info.plist declares the same identifier for the `.note` extension.
    nonisolated static let inkNote = UTType(
        importedAs: "com.martonpaulo.inktools.notebookeditor.note", conformingTo: .data)
}

/// A `.note` file opened read-only (#262): the app never writes it back.
nonisolated struct NoteDocument: FileDocument {
    enum Content: Sendable {
        case note(NoteFile)
        /// The bytes are not a notebook the reader knows, with the reader's reason.
        case unreadable(String)
    }

    static let readableContentTypes: [UTType] = [.inkNote]
    static let writableContentTypes: [UTType] = []

    let content: Content

    init(data: Data) {
        do {
            content = .note(try NoteFile(data: data))
        } catch {
            content = .unreadable(String(describing: error))
        }
    }

    /// A file the reader cannot parse still opens, and its window says why with the next step,
    /// rather than an alert that leaves nothing on screen.
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        self.init(data: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        throw CocoaError(.featureUnsupported)
    }
}
