import AppKit
import InkNotebookEditorKit
import SwiftUI

/// The composition root: a read-only document app for `.note` notebooks (#262). File › Open, Open
/// Recent and the Dock icon come with `DocumentGroup(viewing:)` and Support/Info.plist's document
/// type; File › Open from Tablet opens its own window.
@main
struct InkNotebookEditorApp: App {
    @State private var tablet = TabletBrowser(inkctl: .system(), copies: TabletBrowser.defaultCopies())

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
            // Edit › Find replaces the text-editing items: the notes are read only (#322).
            CommandGroup(replacing: .textEditing) {
                FindCommands()
            }
            CommandGroup(after: .pasteboard) {
                CopyTextCommands()
            }
            CommandGroup(before: .toolbar) {
                SidebarCommands()
                Divider()
            }
            CommandGroup(before: .toolbar) {
                ViewCommands()
            }
            CommandMenu(Copy.goMenu) {
                GoCommands()
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

/// Edit › Copy Page as Text and Copy Note as Text: the recognised words in reading order (#323).
private struct CopyTextCommands: View {
    @FocusedValue(\.noteText) private var text
    @FocusedValue(\.pageNavigator) private var navigator

    var body: some View {
        let page = navigator?.wrappedValue.index
        let pageText = page.flatMap { text?.text(pages: [$0]) }
        Button(Copy.copyPageAsText) {
            if let page { copy(pages: [page]) }
        }
        .keyboardShortcut("c", modifiers: [.command, .option])
        // A page with no recognised words leaves the pasteboard as it is.
        .disabled(pageText?.isEmpty != false)
        .help(text?.index == nil ? Copy.textNotReady : pageText?.isEmpty == true ? Copy.pageHasNoWords : "")
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
