import Accelerate
import CoreGraphics
import NoteEditorKit
import NoteFormat
import Observation
import os

/// The drawn pages of one open notebook. Pages decode off the main actor; the window keeps a
/// thumbnail of every page it has shown, per thumbnail size, and the full raster of only the pages
/// in view and their neighbours, since one full page is several megabytes.
@Observable
final class PageImages {
    enum State {
        case loading
        case ready(CGImage)
        case failed(String)
    }

    /// The two places a page shows small: the page list and the grid of every page (#319).
    enum ThumbnailSize: CaseIterable {
        case sidebar, grid

        /// The page list's thumbnail box, and the grid's, in points.
        static let sidebarBox = CGSize(width: 112, height: 150)
        static let gridBox = CGSize(width: 180, height: 240)

        /// The box the thumbnail fits in, in points.
        var box: CGSize {
            switch self {
            case .sidebar: Self.sidebarBox
            case .grid: Self.gridBox
            }
        }
    }

    private(set) var note: NoteFile
    /// Counts the notes `update` took, so the views that draw pages ask again after one (#315).
    private(set) var generation = 0
    /// The pages and thumbnails whose drawing is of an older copy, and the pages being drawn.
    @ObservationIgnored private var stalePages: Set<Int> = []
    @ObservationIgnored private var staleThumbnails: [ThumbnailSize: Set<Int>] = [:]
    @ObservationIgnored private var drawingPages: Set<Int> = []
    private(set) var pages: [Int: State] = [:]
    private(set) var thumbnails: [ThumbnailSize: [Int: State]] = [:]
    /// The style of each drawn page whose template could not be drawn (#308).
    private(set) var missingTemplates: [Int: String] = [:]
    /// The selectable elements of each page in view, decoded once, in page pixels (#324); the
    /// reader's reason for a page whose elements cannot be read.
    private(set) var elements: [Int: Result<[Selectable], ElementFailure>] = [:]
    private let logger = Logger(subsystem: "com.martonpaulo.inktools.noteeditor", category: "pages")

    init(note: NoteFile) {
        self.note = note
    }

    /// The page's size in pixels, for its aspect before it is drawn.
    func size(of index: Int) -> CGSize {
        let size = note.pageSize
        return note.pages[index].isHorizontal
            ? CGSize(width: size.height, height: size.width) : CGSize(width: size.width, height: size.height)
    }

    /// Every page's place and size in pixels, the values a list of the pages draws from. A list's row
    /// is drawn again once after a newer copy removed its page and before the list shrinks, so a
    /// row never reads the note itself (#329).
    var pageSizes: [PageSize] { note.pages.indices.map { PageSize(index: $0, pixels: size(of: $0)) } }

    /// A page's place in the note, from 0, and its size in pixels.
    struct PageSize {
        let index: Int
        let pixels: CGSize
    }

    func page(_ index: Int) -> State { pages[index] ?? .loading }
    func thumbnail(_ index: Int, _ size: ThumbnailSize = .sidebar) -> State { thumbnails[size]?[index] ?? .loading }

    /// Draws one page at full size, unless it is drawn or being drawn. A page a newer copy
    /// changed keeps its old drawing on screen until the new one is ready (#315).
    func loadPage(_ index: Int) async {
        guard pages[index] == nil || stalePages.contains(index), !drawingPages.contains(index) else { return }
        stalePages.remove(index)
        drawingPages.insert(index)
        defer { drawingPages.remove(index) }
        if pages[index] == nil { pages[index] = .loading }
        let (state, missing) = await Self.draw(note, index, thumbnailPixels: nil, logger: logger)
        // A page scrolled away while it drew is not kept.
        guard pages[index] != nil else { return }
        pages[index] = state
        missingTemplates[index] = missing
    }

    /// Draws the pages in `visible` and one page on each side, and drops every other page's full
    /// raster. A page on screen is never dropped, however many show at the smallest zoom (#319).
    func show(_ visible: Set<Int>) async {
        guard let first = visible.min(), let last = visible.max() else { return }
        let kept = max(first - 1, 0)...min(last + 1, note.pages.count - 1)
        for index in pages.keys where !kept.contains(index) {
            pages[index] = nil
        }
        for index in visible.sorted() + [first - 1, last + 1] where kept.contains(index) {
            await loadPage(index)
        }
        for index in visible.sorted() {
            await loadElements(index)
        }
    }

    /// Why a page's elements cannot be selected: the reader's reason, for the page's marker, and
    /// the whole diagnostic, for a bug report (#459).
    struct ElementFailure: Error, Equatable {
        let reason: String
        let diagnostic: String
    }

    /// The page's elements, read from the Mac's own copy of the note, never from the tablet; a
    /// page's elements are decoded once and kept, as they are small (#324).
    func loadElements(_ index: Int) async {
        guard elements[index] == nil else { return }
        elements[index] = await Self.decode(note, index, logger: logger)
    }

    /// The selectable elements of a page, ready, or `nil` while they decode or when they failed.
    func selectable(_ index: Int) -> [Selectable]? {
        guard case .success(let items) = elements[index] else { return nil }
        return items
    }

    @concurrent
    private static func decode(_ note: NoteFile, _ index: Int, logger: Logger) async -> Result<
        [Selectable], ElementFailure
    > {
        do {
            let read = try note.readElements(page: index)
            for skipped in read.skipped {
                logger.notice(
                    "page \(index + 1, privacy: .public): element \(skipped.record + 1, privacy: .public) of the unknown kind \(skipped.kind, privacy: .public) is not selectable"
                )
            }
            return .success(
                read.elements.enumerated().map { id, element in
                    Selectable(
                        id: id, bounds: element.bounds, points: element.points, isArea: element.kind != .stroke,
                        isPicture: element.kind == .picture, record: element.record)
                })
        } catch {
            logger.error(
                "page \(index + 1, privacy: .public): elements not read: \(String(describing: error), privacy: .public)"
            )
            return .failure(Self.failure(error, format: note.version))
        }
    }

    /// The marker's reason and the report's diagnostic for an element read that failed: the
    /// reader's reason, and the whole error with the app's and the Mac's versions.
    nonisolated static func failure(_ error: any Error, format: Int) -> ElementFailure {
        let reason =
            if case NoteFormatError.badElement(_, let reason) = error { reason } else { Copy.elementBlockUnreadable }
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = info["CFBundleVersion"] as? String ?? "unknown"
        let app = "\(version) (\(build))"
        let mac = ProcessInfo.processInfo.operatingSystemVersionString
        return ElementFailure(
            reason: reason,
            diagnostic: "\(error) Notebook format \(format). Note Editor \(app), macOS \(mac).")
    }

    /// Takes a newer copy of the note (#315): the pages that did not change keep their drawings,
    /// the changed ones draw again and show their old drawing meanwhile; when pages were added,
    /// removed or moved, every page draws again. Returns the changed pages, nil for every page.
    @discardableResult
    func update(_ newer: NoteFile) -> Set<Int>? {
        let changed = NoteDiff.changedPages(note, newer)
        note = newer
        generation += 1
        guard let changed else {
            pages = [:]
            thumbnails = [:]
            missingTemplates = [:]
            elements = [:]
            stalePages = []
            staleThumbnails = [:]
            return nil
        }
        stalePages.formUnion(changed)
        for index in changed {
            elements[index] = nil
            for size in ThumbnailSize.allCases {
                staleThumbnails[size, default: []].insert(index)
            }
        }
        return changed
    }

    /// Whether page `index` shows a drawing of an older copy, waiting for its new one.
    func isStale(_ index: Int) -> Bool { stalePages.contains(index) }

    /// Draws one thumbnail, as many pixels as its box shows on a display of `scale`.
    func loadThumbnail(_ index: Int, _ size: ThumbnailSize = .sidebar, scale: CGFloat) async {
        // The task of a row whose page a delete removed may still start once (#329).
        guard note.pages.indices.contains(index) else { return }
        let stale = staleThumbnails[size, default: []].contains(index)
        guard thumbnails[size]?[index] == nil || stale else { return }
        staleThumbnails[size]?.remove(index)
        if thumbnails[size]?[index] == nil { thumbnails[size, default: [:]][index] = .loading }
        let points = PageFit.fitted(page: self.size(of: index), in: size.box)
        let pixels = PageFit.pixels(for: points, scale: scale)
        let (state, missing) = await Self.draw(note, index, thumbnailPixels: pixels, logger: logger)
        thumbnails[size, default: [:]][index] = state
        missingTemplates[index] = missing
    }

    @concurrent
    private static func draw(
        _ note: NoteFile, _ index: Int, thumbnailPixels: (width: Int, height: Int)?, logger: Logger
    ) async -> (State, missingTemplate: String?) {
        do {
            let bitmap = try note.render(page: index)
            let missing = bitmap.templateFailure
            if let missing {
                logger.error(
                    "page \(index + 1, privacy: .public): template \(missing.style, privacy: .public) not drawn: \(String(describing: missing.reason), privacy: .public)"
                )
            }
            guard let image = bitmap.cgImage() else { return (.failed(Copy.pageHasNoImage), missing?.style) }
            guard let pixels = thumbnailPixels else { return (.ready(image), missing?.style) }
            return (scaled(image, to: pixels).map(State.ready) ?? .failed(Copy.pageHasNoImage), missing?.style)
        } catch {
            logger.error("page \(index + 1, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return (.failed(String(describing: error)), nil)
        }
    }

    /// The page raster resampled to the pixels it is drawn at. SwiftUI's own downscaling of a full
    /// page skips lines of a fine grid and thin strokes; Core Graphics' high-quality resampling
    /// keeps them, and `darkened` keeps them dark.
    @concurrent
    static func fit(_ image: CGImage, to pixels: (width: Int, height: Int)) async -> CGImage? {
        scaled(image, to: pixels)
    }

    nonisolated static func scaled(_ image: CGImage, to pixels: (width: Int, height: Int)) -> CGImage? {
        guard pixels.width > 0, pixels.height > 0,
            let image = darkened(image, by: darkening(from: image.height, to: pixels.height)),
            let context = CGContext(
                data: nil, width: pixels.width, height: pixels.height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { return nil }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: pixels.width, height: pixels.height))
        return context.makeImage()
    }

    /// The side of the darkening square for a page drawn at `toHeight` pixels from `fromHeight`:
    /// none under a third of the size, else the largest odd number up to half the page pixels in
    /// one drawn pixel, at least 3. Half keeps a thumbnail's dots and lines a light texture, as on
    /// paper, rather than a dark one.
    nonisolated static func darkening(from fromHeight: Int, to toHeight: Int) -> Int {
        guard toHeight > 0, fromHeight / toHeight >= smallestDarkening else { return 1 }
        let half = fromHeight / toHeight / 2
        return max(half.isMultiple(of: 2) ? half - 1 : half, smallestDarkening)
    }

    /// The smallest darkening square, and the scale from which a page is darkened.
    nonisolated static let smallestDarkening = 3

    /// Each pixel takes the darkest grey of the `side` x `side` square around it. A page drawn at a
    /// third of its size or less averages a template's dots and thin lines away: on a 1x display a
    /// 5 mm dot grid drew at grey 190 in the page and vanished from the thumbnails, while the
    /// tablet shows it black (#308). Darkening first keeps the marks visible, as a PDF viewer
    /// keeps a hairline one device pixel wide; the ink grows by less than one drawn pixel.
    nonisolated static func darkened(_ image: CGImage, by side: Int) -> CGImage? {
        guard side > 1 else { return image }
        let format = vImage_CGImageFormat(
            bitsPerComponent: 8, bitsPerPixel: 8, colorSpace: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue))
        guard let format, var source = try? vImage_Buffer(cgImage: image, format: format) else { return nil }
        defer { source.free() }
        guard
            var target = try? vImage_Buffer(
                width: Int(source.width), height: Int(source.height), bitsPerPixel: format.bitsPerPixel)
        else { return nil }
        defer { target.free() }
        let kernel = vImagePixelCount(side)
        guard
            vImageMin_Planar8(&source, &target, nil, 0, 0, kernel, kernel, vImage_Flags(kvImageEdgeExtend))
                == kvImageNoError
        else { return nil }
        return try? target.createCGImage(format: format)
    }
}

extension PageImages.State: Equatable {
    static func == (left: Self, right: Self) -> Bool {
        switch (left, right) {
        case (.loading, .loading): true
        case (.ready(let a), .ready(let b)): a === b
        case (.failed(let a), .failed(let b)): a == b
        default: false
        }
    }
}
