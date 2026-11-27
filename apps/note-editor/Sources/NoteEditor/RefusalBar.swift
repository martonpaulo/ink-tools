import NoteEditorKit
import SwiftUI

/// The bar over the pages that says why an edit was taken back (#314), as the find bar stands:
/// one sentence and Dismiss, said aloud when it shows.
struct RefusalBar: View {
    let message: String
    /// The bar's symbol: a warning for a refusal, the shape for Insert › Shape's hint (#350).
    var systemImage = "exclamationmark.triangle.fill"
    var button = Copy.dismiss
    /// A second action beside Dismiss, such as Open Conflict Note (#475).
    var action: (title: String, run: () -> Void)?
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Label(message, systemImage: systemImage)
                .symbolRenderingMode(.multicolor)
                .help(message)
                .frame(maxWidth: .infinity, alignment: .leading)
                // A narrow window cuts the sentence: the whole of it shows under the pointer.
                .help(message)
            if let action { Button(action.title, action: action.run) }
            Button(button, action: dismiss)
        }
        .controlSize(.small)
        .padding(FindBar.inset)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .onAppear { AccessibilityNotification.Announcement(message).post() }
        .onChange(of: message) { _, message in AccessibilityNotification.Announcement(message).post() }
    }
}

/// The editor's refusal bar: why an edit was taken back, Dismiss, and Open Conflict Note when the
/// refusal names a conflict note (#475).
struct EditorRefusalBar: View {
    let editor: NoteEditor
    let live: LiveNote?
    @Environment(\.openDocument) private var openDocument
    /// The conflict note is being copied: the button waits, so a second click starts nothing.
    @State private var opening = false

    var body: some View {
        if let refusal = editor.refusal {
            RefusalBar(
                message: refusal,
                action: editor.conflictNote.map { note in
                    (opening ? Copy.openingConflictNote : Copy.openConflictNote, { if !opening { open(note) } })
                }
            ) { editor.refusal = nil }
        }
    }

    /// Opens the conflict note in its own window, copied as File › Open from Tablet copies a note;
    /// a failure takes the bar's place with its reason.
    private func open(_ note: String) {
        guard let live else { return }
        let browser = TabletBrowser(inkctl: live.inkctl, copies: TabletBrowser.defaultCopies())
        opening = true
        Task {
            defer { opening = false }
            let reason: String
            do {
                try await openDocument(at: try await browser.copy(note))
                editor.refusal = nil
                return
            } catch let failure as InkctlFailure {
                reason = failure.words
            } catch {
                reason = error.localizedDescription
            }
            // The note stays named, and the button stays for another try.
            editor.refuse(
                Copy.cannotOpenConflict(URL(filePath: note).deletingPathExtension().lastPathComponent, reason),
                conflict: note)
        }
    }
}
