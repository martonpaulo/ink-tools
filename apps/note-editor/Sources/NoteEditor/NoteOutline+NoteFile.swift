import NoteEditorKit
import NoteFormat

extension NoteOutline {
    /// The outline a re-target reads (#317): each page's `PAGEID` and each element's box by its
    /// number on the page, the box a selection names it by (`NoteEditor.baseElements`).
    /// Nonisolated: the write path reads it off the main actor.
    nonisolated init(_ file: NoteFile) throws {
        self.init(
            pages: try file.pages.indices.map { index in
                let boxes = try file.elements(page: index).map { ($0.record + 1, EditRect($0.bounds)) }
                return Page(
                    id: file.pages[index].metadata["PAGEID"], boxes: Dictionary(boxes) { first, _ in first })
            })
    }
}
