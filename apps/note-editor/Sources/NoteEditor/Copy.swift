import Foundation
import NoteEditorKit

/// Every visible word of Note Editor, in one place. English only (AGENTS.md, product
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
    static let copyReport = String(localized: "Copy Report")
    static let copyReportHelp = String(localized: "Copies what went wrong, to paste into a bug report")
    static let reportCopied = String(localized: "Report copied")
    static let elementBlockUnreadable = String(localized: "its element block cannot be read")

    // MARK: Notebook window

    static let pages = String(localized: "Pages")
    static let loadingPage = String(localized: "Drawing the page…")
    static let pageFailedTitle = String(localized: "This page cannot be drawn")
    static let pageFailedNext = String(localized: "Other pages may still open. Copy the note from the tablet again.")
    static let unreadableTitle = String(localized: "This file is not a notebook the app can read")
    static let unreadableNext = String(localized: "Open another .note file, or copy the note from the tablet again.")
    static let turnedOffTitle = String(localized: "Notebooks cannot be opened in this version")
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
    /// The toolbar's sidebar button, named as View › Toggle Sidebar (#460).
    static let toggleSidebar = String(localized: "Toggle Sidebar")
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
    static let exportVectorPDF = String(localized: "Export as Vector PDF…")
    static let exportPageSVG = String(localized: "Export Page as SVG…")
    static let exportVectorHelp = String(localized: "The ink as sharp outlines, over the page's template.")
    static let exportFailed = String(localized: "The note could not be exported")

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

    static func elementsNotSelectable(_ reason: String) -> String {
        String(localized: "Nothing on this page can be selected: \(reason)")
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

    // MARK: Edits (#313, #314, #330)

    static let movePageUp = String(localized: "Move Page Up")
    static let movePageDown = String(localized: "Move Page Down")
    static let revertToBackup = String(localized: "Revert to Backup")
    static let revertMessage = String(
        localized:
            "The note on the tablet is replaced by this backup. A backup of the note as it is now is kept first, and Undo starts over."
    )
    static let noBackups = String(localized: "No Backups Yet")
    static let revert = String(localized: "Revert")
    static let dismiss = String(localized: "Dismiss")
    static let openConflictNote = String(localized: "Open Conflict Note", comment: "Refusal bar button (#475)")

    static let openingConflictNote = String(localized: "Opening…", comment: "Refusal bar button while the note copies")

    static func cannotOpenConflict(_ name: String, _ reason: String) -> String {
        String(localized: "The conflict note “\(name)” could not be opened: \(reason)")
    }

    static func revertTitle(_ date: String) -> String {
        String(localized: "Revert the note to the backup of \(date)?")
    }

    static let editOnlyFromTablet = String(localized: "Open the note from the tablet to edit it.")
    static let waitForSends = String(localized: "Wait until every edit reached the tablet.")

    static func sendingEdits(_ count: Int) -> String {
        String(localized: "Edits on their way to the tablet: \(count)")
    }

    // MARK: Resize, rotate and flip (#326)

    /// A change's name in Tools and in VoiceOver's actions, as Preview's Tools menu names them.
    static func name(of change: SelectionChange) -> String {
        switch change {
        case .rotateLeft: String(localized: "Rotate Left")
        case .rotateRight: String(localized: "Rotate Right")
        case .flipHorizontal: String(localized: "Flip Horizontal")
        case .flipVertical: String(localized: "Flip Vertical")
        case .makeLarger: String(localized: "Make Larger")
        case .makeSmaller: String(localized: "Make Smaller")
        }
    }

    /// Why a change of a selection did not start, and what to do.
    enum ChangeRefusal {
        case tooLarge, textBoxTurned, pictureNotPrepared, pictureOnItsWay
    }

    static func refusal(_ refusal: ChangeRefusal) -> String {
        switch refusal {
        case .tooLarge: String(localized: "The selection does not fit on the page after this change. Nothing changed.")
        case .textBoxTurned:
            String(localized: "A text box can be resized but not rotated or flipped: the tablet keeps it upright.")
        case .pictureNotPrepared: String(localized: "The picture could not be prepared for the tablet. Try again.")
        case .pictureOnItsWay: String(localized: "Wait until the picture's change reaches the tablet, then try again.")
        }
    }

    // MARK: Pages (#329)

    static let insertPageEllipsis = String(localized: "Insert Page…")
    static let deletePageEllipsis = String(localized: "Delete Page…")

    /// Delete Page… for one page, «Delete 3 Pages…» for several (#329).
    static func deletePagesEllipsis(_ count: Int) -> String {
        count > 1 ? String(localized: "Delete \(count) Pages…") : deletePageEllipsis
    }

    static func beforePage(_ page: Int) -> String {
        String(localized: "Before Page \(page)")
    }

    static let insertPageTitle = String(localized: "Insert Page")
    static let insertPlace = String(localized: "Place")
    static let template = String(localized: "Template")

    static func afterPage(_ page: Int) -> String {
        String(localized: "After Page \(page)")
    }

    static let insert = String(localized: "Insert")
    static let delete = String(localized: "Delete")
    static let lastPageStays = String(localized: "A note keeps at least one page.")

    static func deletePageTitle(_ page: Int) -> String {
        String(localized: "Delete page \(page)?")
    }

    /// The confirmation's title: the page by its number, or how many pages, from 0-based `pages`.
    static func deletePagesTitle(_ pages: [Int]) -> String {
        pages.count == 1 ? deletePageTitle(pages[0] + 1) : String(localized: "Delete \(pages.count) pages?")
    }

    /// The confirmation's message, naming each page of several by its number, from 0-based `pages`.
    static func deletePagesMessage(_ pages: [Int]) -> String {
        guard pages.count > 1 else {
            return String(localized: "The tablet deletes the page with its ink. Edit › Undo puts it back.")
        }
        let numbers = pages.map { String($0 + 1) }.formatted(.list(type: .and))
        return String(localized: "The tablet deletes pages \(numbers) with their ink. Edit › Undo puts them back.")
    }

    static let readingTemplates = String(localized: "Reading the tablet's templates…")
    /// Insert pressed while the list loads (#531): the page is added once the list is read.
    static let insertWaits = String(localized: "The page is added once the tablet's templates are read.")
    static let customTemplates = String(localized: "Custom")

    /// Why the sheet offers only the note's own templates, or none, with inkctl's words as their own
    /// sentence and the next step: the list is read again when the sheet opens (#451).
    static func templatesFailed(_ reason: String, noteHasTemplates: Bool) -> String {
        noteHasTemplates
            ? String(
                localized:
                    "Only this note's templates are shown: the tablet's list did not load. \(reason) Check that the tablet is connected and awake, then open Insert Page again."
            )
            : String(
                localized:
                    "The tablet's list did not load, and no page of this note uses a template the Mac can send. \(reason) Check that the tablet is connected and awake, then open Insert Page again."
            )
    }

    /// The reason of a list the tablet did not send within the sheet's limit (#531).
    static func templatesTimedOut(_ limit: Duration) -> String {
        String(localized: "The tablet did not answer within \(limit.components.seconds) seconds.")
    }

    /// A template's name as the picker shows it: a system one from its id, a custom one by its file name.
    static func templateName(_ choice: PageTemplateChoice) -> String {
        choice.isCustom ? choice.name : templateName(choice.value)
    }

    /// A template's name as the menu shows it, from its style: `style_8mm_ruled` reads «8mm ruled».
    /// shortcut: made from the style id, since the tablet's list names each system template only by
    /// its id (sn-plugin-lib 0.2.3 answers `name`, `vUri`, `hUri`, #451); use the tablet's own words
    /// if a later list gives them.
    static func templateName(_ style: String) -> String {
        let words = style.replacingOccurrences(of: "style_", with: "").replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    // MARK: Insert (#264)

    static let insertMenu = String(localized: "Insert")
    static let insertPictureEllipsis = String(localized: "Picture…")
    static let textBoxNote = String(
        localized:
            "The tablet sets the text in its own font, in black. The Mac shows it in its own font until the tablet's copy returns."
    )
    static let insertScreenshot = String(localized: "Screenshot")
    static let insertTextBoxEllipsis = String(localized: "Text Box…")
    static let greysNote = String(
        localized: "The tablet shows 16 greys, so the picture is shown and sent in them.")
    static let insertPictureTitle = String(localized: "Insert Picture")
    static let insertTextBoxTitle = String(localized: "Insert Text Box")
    /// Edit › Edit Text Box… and its sheet (#264).
    static let editTextBoxEllipsis = String(localized: "Edit Text Box…", comment: "Edit menu item")
    static let editTextBoxTitle = String(localized: "Edit Text Box", comment: "Sheet title and undo name")
    static let editTextBoxHelp = String(
        localized: "Select one text box to edit its text.", comment: "Why Edit Text Box… is off")
    static let textBoxNeedsText = String(
        localized: "A text box needs text. To remove the text box, close this and choose Edit › Delete.",
        comment: "Why a text box sheet's button is off")
    static let pictureWidth = String(localized: "Width")

    // MARK: Insert › Shape (#350)

    /// A shape's name in Insert › Shape, as Pages and Keynote name theirs.
    static func shapeName(_ kind: ShapeKind) -> String {
        switch kind {
        case .line: String(localized: "Line")
        case .arrow: String(localized: "Arrow")
        case .rectangle: String(localized: "Rectangle")
        case .roundedRectangle: String(localized: "Rounded Rectangle")
        case .ellipse: String(localized: "Ellipse")
        case .triangle: String(localized: "Triangle")
        case .diamond: String(localized: "Diamond")
        }
    }

    static let insertShape = String(localized: "Shape")
    /// The toolbar's Markup items and their help (#460).
    static let insertShapeTool = String(localized: "Insert Shape")
    static let insertTextBoxTool = String(localized: "Insert Text Box")

    /// The bar over the pages while a shape waits for its drag.
    static func shapeHint(_ kind: ShapeKind) -> String {
        switch kind {
        case .line:
            String(
                localized: "Drag on the page to draw a line; hold Shift for 45° steps. Return puts one in the middle.")
        case .arrow:
            String(
                localized: "Drag on the page to draw an arrow; hold Shift for 45° steps. Return puts one in the middle."
            )
        case .rectangle:
            String(
                localized:
                    "Drag on the page to draw a rectangle; hold Shift for a square. Return puts one in the middle.")
        case .roundedRectangle:
            String(
                localized:
                    "Drag on the page to draw a rounded rectangle; hold Shift for a square. Return puts one in the middle."
            )
        case .ellipse:
            String(
                localized:
                    "Drag on the page to draw an ellipse; hold Shift for a circle. Return puts one in the middle.")
        case .triangle:
            String(
                localized:
                    "Drag on the page to draw a triangle; hold Shift to keep its box square. Return puts one in the middle."
            )
        case .diamond:
            String(
                localized:
                    "Drag on the page to draw a diamond; hold Shift to keep its box square. Return puts one in the middle."
            )
        }
    }

    static func cannotInsert(_ reason: String) -> String {
        String(localized: "The picture could not be inserted: \(reason)")
    }

    static func fontSize(_ size: Int) -> String {
        String(localized: "Font size: \(size)")
    }

    static func percentOfPage(_ share: Double) -> String {
        String(localized: "\(share.formatted(.percent.precision(.fractionLength(0)))) of the page's width")
    }

    /// An edit's name in the menu.
    static func name(of edit: NoteEdit) -> String {
        switch edit {
        case .movePage: String(localized: "Move Page")
        case .insertPage: String(localized: "Insert Page")
        case .removePages(let at) where at.count > 1: String(localized: "Delete Pages")
        case .removePages: String(localized: "Delete Page")
        case .restorePages(let at) where at.count > 1: String(localized: "Restore Pages")
        case .restorePages: String(localized: "Restore Page")
        case .moveElements: String(localized: "Move")
        case .insertPicture: String(localized: "Insert Picture")
        case .insertText: String(localized: "Insert Text Box")
        case .insertShape: String(localized: "Insert Shape")
        case .editText: editTextBoxTitle
        case .revertInsert: String(localized: "Remove Insert")
        case .transformElements(let transform):
            switch transform.kind {
            case .resize: String(localized: "Resize")
            case .rotate: String(localized: "Rotate")
            case .flip: String(localized: "Flip")
            }
        case .deleteElements: String(localized: "Delete")
        case .restoreElements: String(localized: "Restore")
        }
    }
}
