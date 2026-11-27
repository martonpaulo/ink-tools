import AppKit
import CoreGraphics
import NoteEditorKit
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

extension FocusedValues {
    /// What the sidebar of the notebook window in front lists, for the View menu.
    @Entry var sidebarMode: Binding<SidebarMode>?
}

/// View › Pages and View › Headings, with Preview's keys for Thumbnails and Table of Contents.
struct SidebarCommands: View {
    @FocusedValue(\.sidebarMode) private var mode

    var body: some View {
        item(.pages, "2")
        item(.headings, "3")
    }

    private func item(_ shown: SidebarMode, _ key: KeyEquivalent) -> some View {
        Toggle(
            shown.title,
            isOn: Binding(get: { mode?.wrappedValue == shown }, set: { if $0 { mode?.wrappedValue = shown } })
        )
        .keyboardShortcut(key, modifiers: [.option, .command])
        .disabled(mode == nil)
    }
}

/// The note's Headings, indented by level; choosing one goes to its page (#331). Each row reads
/// the Heading's recognised words, else shows its handwriting.
struct HeadingsList: View {
    let note: NoteFile
    @Binding var navigator: PageNavigator
    /// Gives the keyboard focus back to the pages once a Heading is chosen.
    let chosen: () -> Void
    @Environment(NoteText.self) private var text: NoteText?
    /// The Heading last chosen, so the right one of two on one page stays selected.
    @State private var lastChosen: Int?

    var body: some View {
        Group {
            switch text?.headings(of: note) ?? Self.read(note) {
            case .failure(let error):
                StateView(.headingsFailed(error.description))
            case .success(let list) where list.isEmpty:
                StateView(.noHeadings)
            case .success(let list):
                List(selection: selection(list)) {
                    ForEach(list.indices, id: \.self) { index in
                        HeadingRow(note: note, heading: list[index], count: navigator.pageCount)
                            .tag(index)
                            // A click on the selected row goes back to its page too.
                            .contentShape(.rect)
                            .simultaneousGesture(TapGesture().onEnded { choose(index, in: list) })
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        // The sidebar's text tokens, so a dark render draws it light (#420).
        .foregroundStyle(Tokens.sidebarText, Tokens.sidebarSecondaryText)
        .accessibilityLabel(Copy.headings)
    }

    /// The current Heading is the last one at or before the current page, as Preview marks the
    /// Table of Contents entry of the page it shows; choosing one shows its page.
    private func selection(_ list: [Heading]) -> Binding<Int?> {
        Binding(
            get: {
                guard let page = navigator.index else { return nil }
                if let lastChosen, list.indices.contains(lastChosen), list[lastChosen].page == page {
                    return lastChosen
                }
                return list.lastIndex { $0.page <= page }
            },
            set: { index in
                if let index { choose(index, in: list) }
            })
    }

    private func choose(_ index: Int, in list: [Heading]) {
        lastChosen = index
        navigator.show(list[index].page)
        chosen()
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
    /// The space between a row's label and its page number, in points.
    static let spacing: CGFloat = 6
    /// A picture's pixels are red, green, blue and opacity, one byte each.
    static let bytesPerPixel = 4
    static let opacityByte = 3

    let note: NoteFile
    let heading: Heading
    let count: Int
    @Environment(NoteText.self) private var text: NoteText?
    @Environment(\.backgroundProminence) private var prominence

    init(note: NoteFile, heading: Heading, count: Int) {
        self.note = note
        self.heading = heading
        self.count = count
    }

    var body: some View {
        let words = text?.words(in: heading)
        // A Heading's picture is a small block, drawn once and kept by the note's text.
        let picture = words == nil ? text?.picture(of: heading, in: note, draw: Self.draw) : nil
        let level = max(heading.level, 1)
        HStack(spacing: Self.spacing) {
            if let words {
                Text(words)
                    .lineLimit(1)
                    .help(words)
                    .fontWeight(level == 1 ? .semibold : .regular)
            } else if let picture {
                // The ink in the label colour, as the rows' text, in light and dark mode.
                let size = CGSize(
                    width: CGFloat(picture.width) * Self.pictureHeight / CGFloat(max(picture.height, 1)),
                    height: Self.pictureHeight)
                Tokens.sidebarText(on: prominence)
                    .frame(width: size.width, height: size.height)
                    .mask {
                        Image(decorative: picture, scale: 1)
                            .resizable()
                            .interpolation(.high)
                            .frame(width: size.width, height: size.height)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
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
        .foregroundStyle(Tokens.sidebarText(on: prominence), Tokens.sidebarSecondaryText(on: prominence))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Copy.headingLabel(words ?? Copy.heading, level, heading.page + 1, count))
    }

    /// The Heading's handwriting as ink on transparent: each grey's darkness becomes its opacity.
    static func draw(_ note: NoteFile, _ heading: Heading) -> CGImage? {
        guard let bitmap = try? note.image(of: heading) else { return nil }
        var pixels = [UInt8](repeating: 0, count: bitmap.pixels.count * bytesPerPixel)
        for (offset, grey) in bitmap.pixels.enumerated() {
            pixels[offset * bytesPerPixel + opacityByte] = UInt8.max - grey
        }
        return pixels.withUnsafeMutableBytes { buffer in
            CGContext(
                data: buffer.baseAddress, width: bitmap.width, height: bitmap.height, bitsPerComponent: 8,
                bytesPerRow: bitmap.width * bytesPerPixel, space: CGColorSpaceCreateDeviceRGB(),
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
