import NoteFormat
import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// A tablet notebook. The format is Ratta's, so the app imports the type rather than owning
    /// it; Support/Info.plist declares the same identifier for the `.note` extension.
    nonisolated static let inkNote = UTType(
        importedAs: "com.martonpaulo.inktools.noteeditor.note", conformingTo: .data)
}

/// A `.note` file opened read-only (#262): the app never writes it back.
nonisolated struct NoteDocument: FileDocument {
    enum Content: Sendable {
        case note(NoteFile)
        /// The bytes are not a notebook the reader knows, with the reader's reason.
        case unreadable(String)
        /// The registry turned the notebook reader off (#293), with the sentence that says so.
        case turnedOff(String)
    }

    static let readableContentTypes: [UTType] = [.inkNote]
    static let writableContentTypes: [UTType] = []

    let content: Content

    init(data: Data) {
        self.init(data: data) { try NoteFile(data: $0) }
    }

    /// `read` is the reader; a test passes one that fails as the registry's kill switch does.
    init(data: Data, read: (Data) throws -> NoteFile) {
        do {
            content = .note(try read(data))
        } catch let failure as InternalFailure where failure.copyKey == "turnedOff" {
            content = .turnedOff(failure.description)
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
