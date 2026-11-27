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
        let afterIndex = pageIndex(after)
        for (index, page) in before.pages.enumerated() {
            guard let id = page.metadata["PAGEID"], let found = afterIndex[id] else {
                lines.append("page \(index + 1): not found in AFTER")
                continue
            }
            let other = after.pages[found]
            var parts = [page.metadata == other.metadata ? "metadata equal" : "metadata changed"]
            for key in NoteFile.layerKeys {
                let old = page.layers.first { $0.key == key }
                let new = other.layers.first { $0.key == key }
                parts.append(
                    compare(
                        key, block(before, old?.bitmapAddress), block(after, new?.bitmapAddress)))
            }
            for key in pageBlocks {
                parts.append(
                    compare(
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

    /// The pages of `after` that differ from the same page of `before`: their metadata, a layer
    /// or an element block changed (#315). `nil` when the pages were added, removed or moved, so
    /// every page is new.
    public static func changedPages(_ before: NoteFile, _ after: NoteFile) -> Set<Int>? {
        let ids = { (file: NoteFile) in file.pages.map { $0.metadata["PAGEID"] } }
        guard before.pages.count == after.pages.count, ids(before) == ids(after) else { return nil }
        var changed = Set<Int>()
        for (index, (old, new)) in zip(before.pages, after.pages).enumerated() {
            let layers = NoteFile.layerKeys.contains { key in
                let oldLayer = old.layers.first { $0.key == key }
                let newLayer = new.layers.first { $0.key == key }
                return block(before, oldLayer?.bitmapAddress) != block(after, newLayer?.bitmapAddress)
            }
            let blocks = pageBlocks.contains { key in
                block(before, old.metadata.address(key)) != block(after, new.metadata.address(key))
            }
            if layers || blocks || !sameMetadata(old.metadata, new.metadata) {
                changed.insert(index)
            }
        }
        return changed
    }

    /// The pages of `before`, by number from 1, that an edit did not touch (`edited`, from 0) and that
    /// `after` lost or changed, for the write path's check (#313). Each page is found by its
    /// `PAGEID`, so a moved page still counts as kept; its layers and element blocks must keep their
    /// bytes, while its metadata may change, as the tablet's save rewrites it (#263).
    public static func untouchedChanged(_ before: NoteFile, _ after: NoteFile, edited: Set<Int>) -> [Int] {
        let afterIndex = pageIndex(after)
        return before.pages.enumerated().compactMap { index, page in
            guard !edited.contains(index) else { return nil }
            guard let id = page.metadata["PAGEID"], let found = afterIndex[id] else { return index + 1 }
            let other = after.pages[found]
            let layers = NoteFile.layerKeys.contains { key in
                block(before, page.layers.first { $0.key == key }?.bitmapAddress)
                    != block(after, other.layers.first { $0.key == key }?.bitmapAddress)
            }
            let blocks = pageBlocks.contains { key in
                block(before, page.metadata.address(key)) != block(after, other.metadata.address(key))
            }
            return layers || blocks ? index + 1 : nil
        }
    }

    /// Each page's index in `file` by its `PAGEID`; the first of two pages with one id wins.
    static func pageIndex(_ file: NoteFile) -> [String: Int] {
        Dictionary(
            file.pages.enumerated().compactMap { entry in
                entry.element.metadata["PAGEID"].map { ($0, entry.offset) }
            },
            uniquingKeysWith: { first, _ in first })
    }

    /// Two page metadata blocks alike but for their addresses, which move whenever any block before
    /// them grows.
    static func sameMetadata(_ old: Metadata, _ new: Metadata) -> Bool {
        let kept = { (metadata: Metadata) in
            metadata.pairs.filter { pair in
                !(NoteFile.layerKeys + pageBlocks).contains(pair.key)
            }
        }
        return kept(old) == kept(new)
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
