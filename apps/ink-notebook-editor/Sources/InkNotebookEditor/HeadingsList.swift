import CoreGraphics
import InkNotebookEditorKit
import NoteFormat
import SwiftUI

/// What the sidebar lists: the pages, or the note's Headings as Preview lists a PDF's Table of
/// Contents (#331).
enum SidebarMode: Hashable, CaseIterable {
    case pages, headings

    var title: String {
        switch self {
        case .pages: Copy.pages
        case .headings: Copy.headings
        }
    }
}

/// The note's Headings, indented by level; choosing one goes to its page (#331). Each row reads
/// the Heading's recognised words, else shows its handwriting.
struct HeadingsList: View {
    let note: NoteFile
    @Binding var navigator: PageNavigator
    /// Gives the keyboard focus back to the pages once a Heading is chosen.
    let chosen: () -> Void
    /// Read once when the list shows: only the footer and the Heading blocks, a few small reads.
    @State private var headings: Result<[Heading], NoteFormatError>
    @State private var selection: Int?

    init(note: NoteFile, navigator: Binding<PageNavigator>, chosen: @escaping () -> Void) {
        self.note = note
        _navigator = navigator
        self.chosen = chosen
        _headings = State(initialValue: Self.read(note))
    }

    var body: some View {
        Group {
            switch headings {
            case .failure(let error):
                StateView(.headingsFailed(error.description))
            case .success(let list) where list.isEmpty:
                StateView(.noHeadings)
            case .success(let list):
                List(selection: $selection) {
                    ForEach(list.indices, id: \.self) { index in
                        HeadingRow(note: note, heading: list[index], count: navigator.pageCount)
                            .tag(index)
                    }
                }
                .onChange(of: selection) { _, index in
                    guard let index else { return }
                    navigator.show(list[index].page)
                    chosen()
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityLabel(Copy.headings)
    }

    static func read(_ note: NoteFile) -> Result<[Heading], NoteFormatError> {
        do {
            return .success(try note.headings())
        } catch let error as NoteFormatError {
            return .failure(error)
        } catch {
            return .failure(.badHeading(String(describing: error)))
        }
    }
}

private struct HeadingRow: View {
    /// The indent of each level below the first, and the height of a Heading's handwriting, in points.
    static let indent: CGFloat = 14
    static let pictureHeight: CGFloat = 22
    /// The levels the tablet makes.
    static let levels = 1...4

    let note: NoteFile
    let heading: Heading
    let count: Int
    @Environment(NoteText.self) private var text: NoteText?
    /// The Heading's handwriting, drawn once with the row: a Heading's picture is a small block.
    @State private var picture: CGImage?

    init(note: NoteFile, heading: Heading, count: Int) {
        self.note = note
        self.heading = heading
        self.count = count
        _picture = State(initialValue: Self.draw(note, heading))
    }

    var body: some View {
        let words = text?.words(in: heading)
        let level = min(max(heading.level, Self.levels.lowerBound), Self.levels.upperBound)
        HStack(spacing: 6) {
            if let words {
                Text(words)
                    .lineLimit(1)
                    .fontWeight(level == 1 ? .semibold : .regular)
            } else if let picture {
                // The ink as a template, so it takes the text colour in light and dark mode.
                Image(decorative: picture, scale: 1)
                    .renderingMode(.template)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .frame(height: Self.pictureHeight, alignment: .leading)
                    .foregroundStyle(.primary)
            } else {
                Text(Copy.heading).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Text("\(heading.page + 1)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .padding(.leading, CGFloat(level - 1) * Self.indent)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Copy.headingLabel(words ?? Copy.heading, level, heading.page + 1, count))
    }

    /// The Heading's handwriting as ink on transparent: each grey's darkness becomes its opacity.
    static func draw(_ note: NoteFile, _ heading: Heading) -> CGImage? {
        guard let bitmap = try? note.image(of: heading) else { return nil }
        var pixels = [UInt8](repeating: 0, count: bitmap.pixels.count * 4)
        for (offset, grey) in bitmap.pixels.enumerated() {
            pixels[offset * 4 + 3] = UInt8.max - grey
        }
        return pixels.withUnsafeMutableBytes { buffer in
            CGContext(
                data: buffer.baseAddress, width: bitmap.width, height: bitmap.height, bitsPerComponent: 8,
                bytesPerRow: bitmap.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)?.makeImage()
        }
    }
}

extension NoteText {
    /// The recognised words inside `heading`'s box, in reading order; nil when the note is still
    /// being read or no word stands there.
    func words(in heading: Heading) -> String? {
        guard let index else { return nil }
        let box = CGRect(x: heading.box.x, y: heading.box.y, width: heading.box.width, height: heading.box.height)
        let inside = index.textWords(pages: [heading.page]).filter {
            box.contains(CGPoint(x: $0.box.midX, y: $0.box.midY))
        }
        let text = ReadingOrder.text(inside)
        return text.isEmpty ? nil : text
    }
}
