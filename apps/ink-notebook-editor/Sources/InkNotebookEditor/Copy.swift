import Foundation

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
}
