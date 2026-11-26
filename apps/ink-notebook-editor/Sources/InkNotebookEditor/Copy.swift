import Foundation
import InkNotebookEditorKit

/// Every visible word of Ink Notebook Editor, in one place. English only (AGENTS.md, product
/// copy); each value goes through `String(localized:)`, and `make strings` refreshes the catalog.
nonisolated enum Copy {
    // MARK: Menus

    static let openFromTablet = String(localized: "Open from Tablet…")
    static let openFromTabletTitle = String(localized: "Open from Tablet")
    static let goMenu = String(localized: "Go")
    static let previousPage = String(localized: "Previous Page")
    static let nextPage = String(localized: "Next Page")
    static let firstPage = String(localized: "First Page")
    static let lastPage = String(localized: "Last Page")
    static let continuousScroll = String(localized: "Continuous Scroll")
    static let contactSheet = String(localized: "Contact Sheet")
    static let viewLayout = String(localized: "Show Pages As")
    static let actualSize = String(localized: "Actual Size")
    static let zoomIn = String(localized: "Zoom In")
    static let zoomOut = String(localized: "Zoom Out")
    static let zoomToFit = String(localized: "Zoom to Fit")
    static let zoomToWidth = String(localized: "Zoom to Width")
    static let zoom = String(localized: "Zoom")
    static let selectionTool = String(localized: "Selection Tool")
    static let rectangularSelection = String(localized: "Rectangular Selection")
    static let lassoSelection = String(localized: "Lasso Selection")
    static let elementsNotSelectable = String(localized: "Nothing on this page can be selected")

    // MARK: Notebook window

    static let pages = String(localized: "Pages")
    static let loadingPage = String(localized: "Drawing the page…")
    static let pageFailedTitle = String(localized: "This page cannot be drawn")
    static let pageFailedNext = String(localized: "Other pages may still open. Copy the note from the tablet again.")
    static let unreadableTitle = String(localized: "This file is not a notebook the app can read")
    static let unreadableNext = String(localized: "Open another .note file, or copy the note from the tablet again.")
    static let noPagesTitle = String(localized: "This notebook has no pages")
    static let noPagesNext = String(localized: "Open another .note file.")
    static let openAnother = String(localized: "Open Another File…")
    static let pageHasNoImage = String(localized: "The page has no image.")

    // MARK: Find, Headings and copy (#322, #331, #323)

    static let findMenu = String(localized: "Find")
    static let findItem = String(localized: "Find…")
    static let findNext = String(localized: "Find Next")
    static let findPrevious = String(localized: "Find Previous")
    static let findInNote = String(localized: "Find in Note")
    static let previousMatch = String(localized: "Previous Match")
    static let nextMatch = String(localized: "Next Match")
    static let done = String(localized: "Done")
    static let noResults = String(localized: "No results")
    static let sidebarShows = String(localized: "Sidebar")
    static let headings = String(localized: "Headings")
    static let heading = String(localized: "Heading")
    static let noHeadingsTitle = String(localized: "No Headings")
    static let noHeadingsNext = String(localized: "Make a Heading on the tablet, then copy the note again.")
    static let headingsFailedTitle = String(localized: "The Headings cannot be read")
    static let headingsFailedNext = String(localized: "The pages still show. Copy the note again to see its Headings.")
    static let copyPageAsText = String(localized: "Copy Page as Text")
    static let copySelectionAsText = String(localized: "Copy Selection as Text")
    static let toolsMenu = String(localized: "Tools")
    static let copyNoteAsText = String(localized: "Copy Note as Text")
    static let textNotReady = String(localized: "The handwriting is still being read.")
    static let pageHasNoWords = String(localized: "This page has no recognised words.")
    static let selectionHasNoWords = String(localized: "The selection has no recognised words.")
    static let untitledNote = String(localized: "Note")

    // MARK: A live note (#315)

    static let syncing = String(localized: "Syncing…")
    static let tabletNotConnected = String(localized: "Tablet not connected. Connect the cable and unlock it.")
    static let copyUnreadable = String(localized: "The note copied from the tablet cannot be read.")
    static let readingHandwritingStart = String(localized: "Reading the handwriting…")

    // MARK: Open from Tablet

    static let loadingTablet = String(localized: "Reading the tablet…")
    static let missingTitle = String(localized: "inkctl is not installed")
    static let missingNext = String(localized: "Install inkctl as cli/inkctl/README.md says, then try again.")
    static let notConnectedTitle = String(localized: "The tablet is not connected")
    static let notConnectedNext = String(localized: "Connect the tablet by cable or Wi-Fi, unlock it, then try again.")
    static let noNotesTitle = String(localized: "No notes in this folder")
    static let noNotesNext = String(localized: "Make a note on the tablet, then refresh.")
    static let notFoundTitle = String(localized: "This folder is not on the tablet")
    static let notFoundNext = String(localized: "Go back to the notes folder and choose again.")
    static let failedTitle = String(localized: "inkctl could not finish")
    static let failedNext = String(localized: "Fix the problem named above, then try again.")
    static let copyFailedTitle = String(localized: "The note could not be copied")
    static let openFailedTitle = String(localized: "The note could not be opened")
    static let reportIssue = String(localized: "Report an Issue…")
    static let cannotBeDrawn = String(localized: "cannot be drawn")
    static let tryAgain = String(localized: "Try Again")
    static let refresh = String(localized: "Refresh")
    static let enclosingFolder = String(localized: "Enclosing Folder")
    static let open = String(localized: "Open")
    static let cancel = String(localized: "Cancel")
    static let ok = String(localized: "OK")
    static let cancelled = String(localized: "The copy was cancelled.")
    static let folderKind = String(localized: "Folder")
    static let tabletHint = String(localized: "The app opens a copy; the note on the tablet stays as it is.")

    // MARK: Copy with values

    static func pageOf(_ page: Int, _ count: Int) -> String {
        String(localized: "Page \(page) of \(count)")
    }

    static func pageOfSelected(_ page: Int, _ count: Int, _ selected: Int) -> String {
        String(localized: "Page \(page) of \(count), \(selected) selected")
    }

    static func syncedAgo(_ seconds: Int) -> String {
        String(localized: "Synced \(seconds) s ago")
    }

    /// A failure's reason as a sentence, and the retry.
    static func syncFailed(_ reason: String) -> String {
        let sentence = reason.hasSuffix(".") ? reason : reason + "."
        return String(localized: "\(sentence) The app tries again in 2 s.")
    }

    /// Which copy a window still shows while the tablet does not answer, after a space.
    static func showingCopy(from time: Date) -> String {
        String(localized: " Showing the copy from \(time.formatted(date: .omitted, time: .standard)).")
    }

    static func selectedCount(_ selected: Int) -> String {
        String(localized: "Elements selected: \(selected)")
    }

    static func templateNotShown(_ style: String) -> String {
        String(localized: "Template \(style) cannot be drawn")
    }

    static func copying(_ name: String) -> String {
        String(localized: "Copying \(name) from the tablet…")
    }

    static func cannotCopy(_ tabletPath: String) -> String {
        String(localized: "\(tabletPath) is not a path the app can copy.")
    }

    static func cannotOpen(_ path: String, _ reason: String) -> String {
        String(localized: "\(path): \(reason)")
    }

    static func matchOf(_ match: Int, _ count: Int) -> String {
        String(localized: "\(match) of \(count)")
    }

    static func readingHandwriting(_ done: Int, _ count: Int) -> String {
        String(localized: "Reading page \(done) of \(count)…")
    }

    static func headingLabel(_ text: String, _ level: Int, _ page: Int, _ count: Int) -> String {
        String(localized: "\(text), level \(level), page \(page) of \(count)")
    }

    // MARK: Undo and Redo (#328)

    static let undoBare = String(localized: "Undo")
    static let redoBare = String(localized: "Redo")

    /// The Edit menu's Undo item for the newest edit, or the bare item with nothing to undo.
    static func undo(_ edit: NoteEdit?) -> String {
        guard let edit else { return undoBare }
        return String(localized: "Undo \(name(of: edit))")
    }

    static func redo(_ edit: NoteEdit?) -> String {
        guard let edit else { return redoBare }
        return String(localized: "Redo \(name(of: edit))")
    }

    /// An edit's name in the menu.
    static func name(of edit: NoteEdit) -> String {
        switch edit {
        case .movePage: String(localized: "Move Page")
        }
    }
}
