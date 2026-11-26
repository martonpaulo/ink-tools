import InkNotebookEditorKit
import SwiftUI

/// Edit › Insert Page… and Delete Page… for the page in front (#329), as Preview's Edit › Insert ›
/// Blank Page and its sidebar's Delete; the sheet and the confirmation are the window's.
struct PageCommands: View {
    @FocusedValue(\.noteEditor) private var editor
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        let page = navigator?.wrappedValue.index
        let selected = navigator?.wrappedValue.selectedPages ?? []
        Button(Copy.insertPageEllipsis) { editor?.insertNextTo = page }
            .disabled(editor?.canInsertPage != true || page == nil)
            .help(
                editor == nil
                    ? Copy.editOnlyFromTablet : editor?.templates.isEmpty == true ? Copy.noSystemTemplate : "")
        Button(Copy.deletePagesEllipsis(selected.count)) { editor?.askRemoval(of: selected) }
            .disabled(editor?.canRemove(selected.count) != true)
            .help(
                editor == nil
                    ? Copy.editOnlyFromTablet : editor?.canRemove(selected.count) == false ? Copy.lastPageStays : "")
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
        _template = State(initialValue: editor.template(of: page) ?? editor.templates.first ?? "")
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

/// The page list's context menu: Insert Page… next to `row`, the row clicked, and Delete Page… for
/// `pages`, the selection when the row is in it (#329).
struct PageMenu: View {
    let editor: NoteEditor?
    let row: Int
    let pages: [Int]

    var body: some View {
        if let editor {
            Button(Copy.insertPageEllipsis) { editor.insertNextTo = row }
                .disabled(!editor.canInsertPage)
                .help(editor.templates.isEmpty ? Copy.noSystemTemplate : "")
            Button(Copy.deletePagesEllipsis(pages.count)) { editor.askRemoval(of: pages) }
                .disabled(!editor.canRemove(pages.count))
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
            .sheet(item: insertRequest) { request in
                if let editor { InsertSheet(editor: editor, request: request) }
            }
            .sheet(item: insertNextTo) { page in
                if let editor { InsertPageSheet(editor: editor, page: page.value, inserted: show) }
            }
            .alert(
                Copy.deletePagesTitle(editor?.removalAsked ?? []), isPresented: asked(\.removalAsked),
                presenting: editor?.removalAsked
            ) { pages in
                Button(Copy.delete, role: .destructive) {
                    guard let editor, let first = pages.first, editor.removePages(at: pages) else { return }
                    show(min(first, editor.pageCount - 1))
                }
                Button(Copy.cancel, role: .cancel) {}
            } message: { pages in
                Text(Copy.deletePagesMessage(pages))
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

    private var insertRequest: Binding<InsertRequest?> {
        Binding(get: { editor?.insertRequest }, set: { editor?.insertRequest = $0 })
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
