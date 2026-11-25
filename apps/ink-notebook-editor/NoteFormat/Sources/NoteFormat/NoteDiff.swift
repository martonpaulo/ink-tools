// The byte comparison of #263: which blocks of each page an edit kept, for `note-tool diff`.
import Foundation

/// Compares two notes page by page. Each page of `before` is found in `after` by its `PAGEID`;
/// a line says which of its blocks kept their bytes. It never prints block content.
public enum NoteDiff {
    /// The page blocks compared besides the layers: the strokes and elements, the recognised text
    /// and its file, and the text boxes.
    static let pageBlocks = ["TOTALPATH", "RECOGNTEXT", "RECOGNFILE", "PAGETEXTBOX"]

    /// The report, one line per page and one per footer key family that either note has.
    public static func lines(_ before: NoteFile, _ after: NoteFile) -> [String] {
        var lines = ["pages: \(before.pages.count) -> \(after.pages.count)"]
        let afterIndex = Dictionary(
            after.pages.enumerated().compactMap { entry in
                entry.element.metadata["PAGEID"].map { ($0, entry.offset) }
            },
            uniquingKeysWith: { first, _ in first })
        for (index, page) in before.pages.enumerated() {
            guard let id = page.metadata["PAGEID"], let found = afterIndex[id] else {
                lines.append("page \(index + 1): not found in AFTER")
                continue
            }
            let other = after.pages[found]
            var parts = [page.metadata == other.metadata ? "metadata equal" : "metadata changed"]
            for key in NoteFile.layerKeys {
                let old = page.layers.first { $0.key == key }, new = other.layers.first { $0.key == key }
                parts.append(compare(
                    key, block(before, old?.bitmapAddress), block(after, new?.bitmapAddress)))
            }
            for key in pageBlocks {
                parts.append(compare(
                    key, block(before, page.metadata.address(key)), block(after, other.metadata.address(key))))
            }
            lines.append("page \(index + 1) -> \(found + 1): " + parts.joined(separator: ", "))
        }
        for prefix in NoteWriter.pageKeyPrefixes {
            let old = before.footer.pairs.filter { $0.key.hasPrefix(prefix) }
            let new = after.footer.pairs.filter { $0.key.hasPrefix(prefix) }
            guard !old.isEmpty || !new.isEmpty else { continue }
            let values = old.map(\.value) == new.map(\.value) ? "equal" : "changed"
            lines.append("footer \(prefix): \(old.count) -> \(new.count), values \(values)")
        }
        return lines
    }

    static func block(_ file: NoteFile, _ address: Int?) -> ArraySlice<UInt8>? {
        guard let address, address != 0 else { return nil }
        return try? file.block(at: address)
    }

    static func compare(_ name: String, _ before: ArraySlice<UInt8>?, _ after: ArraySlice<UInt8>?) -> String {
        switch (before, after) {
        case (nil, nil): "\(name) absent"
        case (nil, let new?): "\(name) added (\(new.count) bytes)"
        case (_?, nil): "\(name) removed"
        case (let old?, let new?):
            old == new ? "\(name) equal" : "\(name) changed (\(old.count) -> \(new.count) bytes)"
        }
    }
}
