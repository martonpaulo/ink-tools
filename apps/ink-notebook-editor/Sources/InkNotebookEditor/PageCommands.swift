import InkNotebookEditorKit
import SwiftUI

/// Edit › Insert Page… and Delete Page… for the page in front (#329), as Preview's Edit › Insert ›
/// Blank Page and its sidebar's Delete; the sheet and the confirmation are the window's.
struct PageCommands: View {
    @FocusedValue(\.noteEditor) private var editor
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        let page = navigator?.wrappedValue.index
        Button(Copy.insertPageEllipsis) { editor?.insertNextTo = page }
            .disabled(editor?.canEdit != true || page == nil)
            .help(editor == nil ? Copy.editOnlyFromTablet : "")
        Button(Copy.deletePageEllipsis) { editor?.removalAsked = page }
            .disabled(editor?.canRemovePage != true || page == nil)
            .help(editor == nil ? Copy.editOnlyFromTablet : editor?.canRemovePage == false ? Copy.lastPageStays : "")
    }
}

/// Where an added page goes, next to the page in front.
enum InsertPlace: Hashable, CaseIterable {
    case before, after

    func index(nextTo page: Int) -> Int { self == .before ? page : page + 1 }
}

/// The sheet of Edit › Insert Page…: where the page goes and its template, each template this note
/// uses, the page in front's first (#329). The tablet draws the template; the Mac shows it at once.
struct InsertPageSheet: View {
    /// The sheet's width, in points, as a Preview sheet of two choices.
    static let width: CGFloat = 340
    /// The space around the sheet's content, in points, as a system sheet's.
    static let inset: CGFloat = 20

    let editor: NoteEditor
    let page: Int
    let inserted: (Int) -> Void
    @State private var place = InsertPlace.after
    @State private var template: String
    @Environment(\.dismiss) private var dismiss

    init(editor: NoteEditor, page: Int, inserted: @escaping (Int) -> Void) {
        self.editor = editor
        self.page = page
        self.inserted = inserted
        let style = editor.shown.pages.indices.contains(page) ? editor.shown.pages[page].style : nil
        _template = State(initialValue: style ?? editor.templates.first ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(Copy.insertPageTitle)
                .font(.headline)
            Form {
                Picker(Copy.insertPlace, selection: $place) {
                    Text(Copy.beforePage(page + 1)).tag(InsertPlace.before)
                    Text(Copy.afterPage(page + 1)).tag(InsertPlace.after)
                }
                .pickerStyle(.radioGroup)
                Picker(Copy.template, selection: $template) {
                    ForEach(editor.templates, id: \.self) { Text(Copy.templateName($0)).tag($0) }
                }
            }
            HStack {
                Spacer()
                Button(Copy.cancel, role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(Copy.insert) {
                    let at = place.index(nextTo: page)
                    if editor.insertPage(at: at, template: template) { inserted(at) }
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(template.isEmpty)
            }
        }
        .padding(Self.inset)
        .frame(width: Self.width)
    }
}

/// The page list's context menu: Insert Page… and Delete Page… for that page (#329).
struct PageMenu: View {
    let editor: NoteEditor?
    let page: Int

    var body: some View {
        if let editor {
            Button(Copy.insertPageEllipsis) { editor.insertNextTo = page }
                .disabled(!editor.canEdit)
            Button(Copy.deletePageEllipsis) { editor.removalAsked = page }
                .disabled(!editor.canRemovePage)
        }
    }
}

/// The window's sheet and confirmations of the edits: Insert Page…, Delete Page… and Revert to
/// Backup (#313, #329). `show` turns to the page an edit added or left.
struct EditDialogs: ViewModifier {
    let editor: NoteEditor?
    let show: (Int) -> Void

    func body(content: Content) -> some View {
        content
            .sheet(item: insertNextTo) { page in
                if let editor { InsertPageSheet(editor: editor, page: page.value, inserted: show) }
            }
            .alert(
                Copy.deletePageTitle((editor?.removalAsked ?? 0) + 1), isPresented: asked(\.removalAsked),
                presenting: editor?.removalAsked
            ) { page in
                Button(Copy.delete, role: .destructive) {
                    guard let editor, editor.removePage(at: page) else { return }
                    show(min(page, editor.pageCount - 1))
                }
                Button(Copy.cancel, role: .cancel) {}
            } message: { _ in
                Text(Copy.deletePagesMessage(1))
            }
            .alert(
                Copy.revertTitle(editor?.revertCandidate.map(RevertCommands.title) ?? ""),
                isPresented: asked(\.revertCandidate), presenting: editor?.revertCandidate
            ) { backup in
                Button(Copy.revert, role: .destructive) {
                    Task { await editor?.revert(to: backup) }
                }
                Button(Copy.cancel, role: .cancel) {}
            } message: { _ in
                Text(Copy.revertMessage)
            }
    }

    /// A page as a sheet's item.
    struct Page: Identifiable {
        let value: Int
        var id: Int { value }
    }

    private var insertNextTo: Binding<Page?> {
        Binding(
            get: { editor?.insertNextTo.map(Page.init) },
            set: { editor?.insertNextTo = $0?.value })
    }

    /// Open while the editor holds a request at `key`; closing clears it.
    private func asked<Value>(_ key: ReferenceWritableKeyPath<NoteEditor, Value?>) -> Binding<Bool> {
        Binding(
            get: { editor?[keyPath: key] != nil },
            set: { if !$0 { editor?[keyPath: key] = nil } })
    }
}
