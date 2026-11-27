import AppKit
import NoteEditorKit
import SwiftUI
import os

/// The composition root: a read-only document app for `.note` notebooks (#262). File › Open, Open
/// Recent and the Dock icon come with `DocumentGroup(viewing:)` and Support/Info.plist's document
/// type; File › Open from Tablet opens its own window.
@main
struct NoteEditorApp: App {
    @State private var tablet = TabletBrowser(inkctl: .system(), copies: TabletBrowser.defaultCopies())

    /// A build under the app's first name kept its backups, copies and window places under that
    /// name; they move to the new one before any window opens (#461).
    init() {
        let logger = Logger(subsystem: AppFolders.identifier, category: "launch")
        guard let support = try? AppFolders.support() else {
            logger.error("no Application Support folder; the old name's files stay where they are")
            return
        }
        let report = LegacyNames.migrate(support: support)
        logger.info(
            "old name: folder \(String(describing: report.named)), copies \(String(describing: report.identifier)), defaults \(String(describing: report.defaults))"
        )
    }

    var body: some Scene {
        DocumentGroup(viewing: NoteDocument.self) { file in
            NotebookWindow(
                document: file.document, name: file.fileURL?.deletingPathExtension().lastPathComponent ?? "")
        }
        // The window opens at its content's ideal size, wide for a landscape note (#291), and
        // never past the screen's edge.
        .defaultWindowPlacement { content, context in
            let ideal = content.sizeThatFits(.unspecified)
            return WindowPlacement(size: PageFit.onScreen(ideal, screen: context.defaultDisplay.visibleRect.size))
        }
        .commands {
            CommandGroup(after: .newItem) {
                OpenFromTabletCommand()
            }
            CommandGroup(after: .saveItem) {
                RevertCommands()
            }
            CommandGroup(after: .importExport) {
                ExportCommands()
            }
            // Undo and Redo of the note's edits, named by the history (#328).
            CommandGroup(replacing: .undoRedo) {
                UndoCommands()
            }
            // Edit › Find replaces the text-editing items: the notes are read only (#322).
            CommandGroup(replacing: .textEditing) {
                FindCommands()
            }
            CommandGroup(after: .pasteboard) {
                CopyTextCommands()
                Divider()
                MovePageCommands()
                PageCommands()
                EditTextBoxCommand()
            }
            CommandGroup(before: .toolbar) {
                SidebarCommands()
                Divider()
            }
            CommandGroup(before: .toolbar) {
                ViewCommands()
            }
            // View › Show Toolbar and Customize Toolbar…, for the toolbar's own set (#460).
            ToolbarCommands()
            // An Insert menu, as Pages holds one (#264).
            CommandMenu(Copy.insertMenu) {
                InsertCommands()
            }
            CommandMenu(Copy.goMenu) {
                GoCommands()
            }
            CommandMenu(Copy.toolsMenu) {
                ToolCommands()
            }
            CommandGroup(replacing: .help) {
                ReportIssueCommand()
            }
        }

        Window(Copy.openFromTabletTitle, id: OpenFromTabletView.windowID) {
            OpenFromTabletView(browser: tablet)
        }
        .windowResizability(.contentMinSize)
        .defaultSize(width: 560, height: 440)
    }
}

private struct OpenFromTabletCommand: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button(Copy.openFromTablet) {
            openWindow(id: OpenFromTabletView.windowID)
        }
        .keyboardShortcut("o", modifiers: [.command, .shift])
    }
}

/// The Go menu: the page keys, named and discoverable, for the notebook window in front.
private struct GoCommands: View {
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        item(Copy.previousPage, .previous, KeyboardShortcut(.upArrow, modifiers: [.option, .command]))
        item(Copy.nextPage, .next, KeyboardShortcut(.downArrow, modifiers: [.option, .command]))
        Divider()
        item(Copy.firstPage, .first, KeyboardShortcut(.home, modifiers: []))
        item(Copy.lastPage, .last, KeyboardShortcut(.end, modifiers: []))
    }

    private func item(_ title: String, _ move: PageMove, _ shortcut: KeyboardShortcut) -> some View {
        Button(title) { navigator?.wrappedValue.go(move) }
            .keyboardShortcut(shortcut)
            .disabled(navigator?.wrappedValue.allows(move) != true)
    }
}

/// The View menu's layout and zoom items for the notebook window in front, with Preview's names
/// and its zoom keys (#319).
private struct ViewCommands: View {
    @FocusedValue(\.pageViewer) private var viewer

    var body: some View {
        layout(Copy.continuousScroll, .scroll, "1")
        layout(Copy.contactSheet, .grid, "2")
        Divider()
        zoom(Copy.actualSize, viewer.map { _ in .magnification(1) }, KeyboardShortcut("0"))
        zoom(Copy.zoomIn, viewer?.zoomedIn, KeyboardShortcut("+"))
        zoom(Copy.zoomOut, viewer?.zoomedOut, KeyboardShortcut("-"))
        zoom(Copy.zoomToFit, viewer.map { _ in .fitPage }, KeyboardShortcut("9"))
        zoom(Copy.zoomToWidth, viewer.map { _ in .fitWidth }, KeyboardShortcut("9", modifiers: [.option, .command]))
        Divider()
    }

    private func layout(_ title: String, _ layout: PageViewer.Layout, _ key: KeyEquivalent) -> some View {
        Toggle(
            title,
            isOn: Binding(
                get: { viewer?.layout == layout },
                set: { if $0 { viewer?.layout = layout } })
        )
        .keyboardShortcut(key)
        .disabled(viewer == nil)
    }

    private func zoom(_ title: String, _ zoom: PageZoom?, _ shortcut: KeyboardShortcut) -> some View {
        Button(title) {
            if let zoom { viewer?.show(zoom) }
        }
        .keyboardShortcut(shortcut)
        .disabled(zoom == nil)
    }
}

/// Help › Report an Issue…: the repository's bug form with this build's version filled in.
private struct ReportIssueCommand: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button(Copy.reportIssue) {
            let info = Bundle.main.infoDictionary ?? [:]
            let system = ProcessInfo.processInfo.operatingSystemVersion
            let url = IssueReport.url(
                version: info["CFBundleShortVersionString"] as? String ?? "unknown",
                build: info["CFBundleVersion"] as? String ?? "unknown",
                releaseDate: info["AppReleaseDate"] as? String,
                macOS: "\(system.majorVersion).\(system.minorVersion).\(system.patchVersion)")
            if let url { openURL(url) }
        }
    }
}

/// Tools › Rectangular Selection and Lasso Selection, as Preview's Tools menu holds them (#324),
/// then Rotate Left and Right and Flip Horizontal and Vertical of the selection (#326).
private struct ToolCommands: View {
    @FocusedValue(\.pageViewer) private var viewer
    @FocusedValue(\.pageImages) private var pages
    @FocusedValue(\.noteEditor) private var editor

    var body: some View {
        tool(Copy.rectangularSelection, .rectangle)
        tool(Copy.lassoSelection, .lasso)
        Divider()
        ForEach(SelectionChange.menu, id: \.self) { change in
            Button(change.title) {
                guard let editor, let page = viewer?.selection.page else { return }
                change.apply(to: selected, page: page, editor: editor)
            }
            .keyboardShortcut(change.shortcut)
            .disabled(!can(change))
            .help(editor == nil ? Copy.editOnlyFromTablet : "")
        }
    }

    /// Whether `change` can start: a selection on a note from the tablet, no text box for a turn,
    /// and no picture's change on its way to the page (#326).
    private func can(_ change: SelectionChange) -> Bool {
        guard let editor, editor.canEdit, let page = viewer?.selection.page, !selected.isEmpty else { return false }
        return (!change.turns || SelectionChange.turns(selected)) && !editor.pictureWaiting(on: page)
    }

    /// The selected elements of the window in front.
    private var selected: [Selectable] {
        guard let viewer, let page = viewer.selection.page else { return [] }
        return pages?.selectable(page)?.filter { viewer.selection.ids.contains($0.id) } ?? []
    }

    private func tool(_ title: String, _ tool: PageViewer.SelectionTool) -> some View {
        Toggle(
            title,
            isOn: Binding(
                get: { viewer?.shownTool == tool },
                set: { if $0 { viewer?.tool = tool } })
        )
        .disabled(viewer?.layout != .scroll)
    }
}

/// Edit › Copy as Text and Copy Note as Text: the recognised words in reading order, of the
/// selection when there is one, else of the current page (#323).
private struct CopyTextCommands: View {
    @FocusedValue(\.noteText) private var text
    @FocusedValue(\.pageNavigator) private var navigator
    @FocusedValue(\.pageViewer) private var viewer
    @FocusedValue(\.pageImages) private var pages

    var body: some View {
        let page = navigator?.wrappedValue.index
        let selected = pages.flatMap { viewer?.selected(in: $0, on: page) }
        let frame = selected?.items.map(\.bounds).reduce(CGRect.null) { $0.union($1) }
        let pageText =
            if let selected, let frame {
                text?.text(page: selected.page, in: frame)
            } else {
                page.flatMap { text?.text(pages: [$0]) }
            }
        Button(selected == nil ? Copy.copyPageAsText : Copy.copySelectionAsText) {
            guard let pageText, !pageText.isEmpty else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(pageText, forType: .string)
        }
        .keyboardShortcut("c", modifiers: [.command, .option])
        // A page with no recognised words leaves the pasteboard as it is.
        .disabled(pageText?.isEmpty != false)
        .help(
            text?.index == nil
                ? Copy.textNotReady
                : pageText?.isEmpty == true ? (selected == nil ? Copy.pageHasNoWords : Copy.selectionHasNoWords) : "")
        Button(Copy.copyNoteAsText) { copy(pages: nil) }
            .keyboardShortcut("c", modifiers: [.command, .option, .shift])
            .disabled(text?.index == nil)
            .help(text?.index == nil ? Copy.textNotReady : "")
    }

    private func copy(pages: Set<Int>?) {
        guard let words = text?.text(pages: pages) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(words, forType: .string)
    }
}

/// Edit › Undo and Redo: the note's edits, through the write path (#313, #328). A text field in
/// front, such as the find bar's, keeps its own undo; a note opened from a file has no edits.
private struct UndoCommands: View {
    @FocusedValue(\.noteEditor) private var editor

    var body: some View {
        Button(Copy.undo(editor?.history.undoKind)) {
            if let editor, !Self.textInFront {
                editor.undo()
            } else {
                NSApp.sendAction(Selector(("undo:")), to: nil, from: nil)
            }
        }
        .keyboardShortcut("z")
        .disabled(editor.map { !$0.canUndo } ?? false)
        Button(Copy.redo(editor?.history.redoKind)) {
            if let editor, !Self.textInFront {
                editor.redo()
            } else {
                NSApp.sendAction(Selector(("redo:")), to: nil, from: nil)
            }
        }
        .keyboardShortcut("z", modifiers: [.command, .shift])
        .disabled(editor.map { !$0.canRedo } ?? false)
    }

    /// Whether the keyboard is in a text field, whose typing has its own undo.
    static var textInFront: Bool { NSApp.keyWindow?.firstResponder is NSText }
}

/// Edit › Move Page Up and Move Page Down: the current page one place up or down (#330), on a
/// note opened from the tablet. Control-Command-Up and Down (owner, D92 A; Command-Option-Arrow is
/// Go › Previous and Next Page, #319).
private struct MovePageCommands: View {
    @FocusedValue(\.noteEditor) private var editor
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        item(Copy.movePageUp, by: -1, key: .upArrow)
        item(Copy.movePageDown, by: 1, key: .downArrow)
    }

    private func item(_ title: String, by step: Int, key: KeyEquivalent) -> some View {
        let from = navigator?.wrappedValue.index
        let to = from.map { $0 + step }
        let fits = editor?.canEdit == true && to.map { (0..<(editor?.pageCount ?? 0)).contains($0) } == true
        return Button(title) {
            guard let editor, let from, let to, editor.movePage(from: from, to: to) else { return }
            navigator?.wrappedValue.show(to)
        }
        .keyboardShortcut(key, modifiers: [.control, .command])
        .disabled(!fits)
        .help(editor == nil ? Copy.editOnlyFromTablet : "")
    }
}

/// File › Revert to Backup: the note's backups by date, newest first, as TextEdit's File ›
/// Revert To lists versions (#313). The window asks before it replaces the tablet's note.
struct RevertCommands: View {
    @FocusedValue(\.noteEditor) private var editor

    var body: some View {
        Menu(Copy.revertToBackup) {
            if let editor, !editor.backups.isEmpty {
                ForEach(editor.backups, id: \.self) { backup in
                    Button(Self.title(backup)) { editor.revertCandidate = backup }
                }
            } else {
                Button(Copy.noBackups) {}
                    .disabled(true)
            }
        }
        .disabled(editor?.canRevert != true)
        .help(editor == nil ? Copy.editOnlyFromTablet : editor?.pending.isEmpty == false ? Copy.waitForSends : "")
    }

    /// A backup's date and time, as the menu and the confirmation name it.
    static func title(_ backup: URL) -> String {
        NoteBackups.date(of: backup)?.formatted(date: .abbreviated, time: .standard) ?? backup.lastPathComponent
    }
}
