import NoteEditorKit
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
            .help(editor == nil ? Copy.editOnlyFromTablet : "")
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

/// The sheet of Edit › Insert Page…: where the page goes and its template, from the tablet's list,
/// the page in front's first (#329, #451); while the list loads a progress line shows, and when the
/// tablet does not answer, the note's own templates with why. The tablet draws the template.
/// Insert pressed while the list loads says so in the template row and adds the page with the first
/// choice, the page in front's template, once the tablet's list is read (#531): a press is never
/// lost. When the list does not come, the sheet stays open with the note's own templates and why.
struct InsertPageSheet: View {
    /// The sheet's width, in points, as a Preview sheet of two choices.
    static let width: CGFloat = 340
    /// The space around the sheet's content, in points, as a system sheet's.
    static let inset: CGFloat = 20

    /// What a press of Insert does (#531).
    enum Press: Equatable {
        /// Adds the page on this template.
        case insert(String)
        /// The list is loading: wait for it, then add the page on its first choice.
        case wait
        /// No template can be sent; the sheet says why.
        case none
    }

    static func press(_ list: NoteEditor.TemplateList, chosen: String?) -> Press {
        if list == .loading { return .wait }
        return chosen.map(Press.insert) ?? .none
    }

    let editor: NoteEditor
    let page: Int
    /// Reads the tablet's list when the sheet opens; a render sets the list itself and passes false.
    let loads: Bool
    let inserted: (Int) -> Void
    @State private var place = InsertPlace.after
    @State private var template: String?
    /// Insert was pressed while the list loaded; the page is added once it is read.
    @State private var waiting: Bool
    @Environment(\.dismiss) private var dismiss

    /// `waiting` is for a render of Insert pressed while the list loads.
    init(
        editor: NoteEditor, page: Int, loads: Bool = true, waiting: Bool = false,
        inserted: @escaping (Int) -> Void
    ) {
        self.editor = editor
        self.page = page
        self.loads = loads
        _waiting = State(initialValue: waiting)
        self.inserted = inserted
    }

    private func insert(_ value: String) {
        let at = place.index(nextTo: page)
        if editor.insertPage(at: at, template: value) { inserted(at) }
        dismiss()
    }

    var body: some View {
        let list = editor.templateList
        let choices = list.choices
        let system = choices.filter { !$0.isCustom }
        let custom = choices.filter(\.isCustom)
        let chosen = template ?? choices.first?.value
        VStack(alignment: .leading, spacing: 16) {
            Text(Copy.insertPageTitle)
                .font(.headline)
            Form {
                Picker(Copy.insertPlace, selection: $place) {
                    Text(Copy.beforePage(page + 1)).tag(InsertPlace.before)
                    Text(Copy.afterPage(page + 1)).tag(InsertPlace.after)
                }
                .pickerStyle(.radioGroup)
                if list == .loading {
                    LabeledContent(Copy.template) {
                        HStack {
                            ProgressView().controlSize(.small)
                            Text(waiting ? Copy.insertWaits : Copy.readingTemplates).foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } else if !choices.isEmpty {
                    Picker(Copy.template, selection: Binding(get: { chosen ?? "" }, set: { template = $0 })) {
                        ForEach(system) { Text(Copy.templateName($0)).tag($0.value) }
                        if !custom.isEmpty {
                            Section(Copy.customTemplates) {
                                ForEach(custom) { Text(Copy.templateName($0)).tag($0.value) }
                            }
                        }
                    }
                }
            }
            if case .noteOnly(let fallback, let reason) = list {
                let message = Copy.templatesFailed(reason, noteHasTemplates: !fallback.isEmpty)
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
                    .onAppear { AccessibilityNotification.Announcement(message).post() }
            }
            HStack {
                Spacer()
                Button(Copy.cancel, role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button {
                    switch Self.press(list, chosen: chosen) {
                    case .insert(let value): insert(value)
                    case .wait: waiting = true
                    case .none: break
                    }
                } label: {
                    Text(Copy.insert)
                }
                .keyboardShortcut(.defaultAction)
                .disabled(waiting || (list != .loading && chosen == nil))
            }
        }
        .onChange(of: waiting) { _, now in
            if now { AccessibilityNotification.Announcement(Copy.insertWaits).post() }
        }
        .onChange(of: editor.templateList) { _, loaded in
            guard waiting, loaded != .loading else { return }
            waiting = false
            // Only the tablet's own list adds the page unasked; without it the sheet shows why.
            if case .tablet(let choices) = loaded, let first = template ?? choices.first?.value { insert(first) }
        }
        .padding(Self.inset)
        .frame(width: Self.width)
        .task {
            guard loads else { return }
            await editor.loadTemplates(nextTo: page)
        }
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
