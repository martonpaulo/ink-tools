import NoteEditorKit
import SwiftUI

/// The toolbar of a notebook window, in Preview's order (#460): the layout, the zoom, the Markup
/// tools and the find field last. View › Customize Toolbar changes it, and the window keeps the
/// owner's set. Share (#467), Get Info (#468) and rotate (#341) join it when they exist, never as a
/// placeholder.
struct ViewerToolbar: CustomizableToolbarContent {
    /// The toolbar's identifier, under which the window keeps a customized set.
    static let id = "notebook"
    /// A magnification as the zoom pop-up shows it: a whole percentage.
    static let percent = FloatingPointFormatStyle<Double>.Percent.percent.precision(.fractionLength(0))

    @Bindable var viewer: PageViewer
    let editor: NoteEditor?
    let text: NoteText?
    let page: Int?
    /// Gives the keyboard focus back to the pages when Escape ends a find.
    let findClosed: () -> Void

    var body: some CustomizableToolbarContent {
        ToolbarItem(id: "layout") {
            Picker(Copy.viewLayout, selection: $viewer.layout) {
                // Preview's symbols for the same two views.
                Label(Copy.continuousScroll, systemImage: "scroll").tag(PageViewer.Layout.scroll)
                    .help(Copy.continuousScroll)
                Label(Copy.contactSheet, systemImage: "square.grid.3x3.square").tag(PageViewer.Layout.grid)
                    .help(Copy.contactSheet)
            }
            .pickerStyle(.segmented)
            .labelStyle(.iconOnly)
        }
        ToolbarItem(id: "zoom") { zoom }
        // Preview keeps its selection tools, shapes and text in its Markup tools.
        ToolbarItem(id: "selection") {
            Picker(Copy.selectionTool, selection: $viewer.shownTool) {
                Label(Copy.rectangularSelection, systemImage: "rectangle.dashed").tag(
                    PageViewer.SelectionTool?.some(.rectangle)
                )
                .help(Copy.rectangularSelection)
                Label(Copy.lassoSelection, systemImage: "lasso").tag(PageViewer.SelectionTool?.some(.lasso))
                    .help(Copy.lassoSelection)
            }
            .pickerStyle(.segmented)
            .labelStyle(.iconOnly)
            .disabled(viewer.layout != .scroll)
        }
        ToolbarItem(id: "shape") {
            Menu {
                ForEach(ShapeKind.allCases, id: \.self) { kind in
                    Button(Copy.shapeName(kind), systemImage: kind.symbol) {
                        viewer.layout = .scroll
                        viewer.shapeTool = kind
                    }
                }
            } label: {
                Label(Copy.insertShapeTool, systemImage: "square.on.circle")
            }
            .disabled(!canEdit)
            .help(canEdit ? Copy.insertShapeTool : Copy.editOnlyFromTablet)
        }
        ToolbarItem(id: "textBox") {
            Button(Copy.insertTextBoxTool, systemImage: "character.textbox") {
                guard let page else { return }
                editor?.insertRequest = InsertRequest(page: page, content: .text(""))
            }
            .disabled(!canEdit || page == nil)
            .help(canEdit ? Copy.insertTextBoxTool : Copy.editOnlyFromTablet)
        }
        if let text {
            ToolbarItem(id: "search") {
                FindField(text: text, closed: findClosed)
                    .frame(width: FindField.width)
                    .help(Copy.findInNote)
            }
        }
    }

    /// Whether the Markup tools can insert: a note from the tablet, as the Insert menu asks.
    private var canEdit: Bool { editor?.canEdit == true }

    /// Zoom Out, the zoom pop-up and Zoom In, in one group so a narrow window keeps them together.
    private var zoom: some View {
        ControlGroup {
            Button(Copy.zoomOut, systemImage: "minus.magnifyingglass") {
                if let zoom = viewer.zoomedOut { viewer.zoom = zoom }
            }
            .disabled(viewer.zoomedOut == nil)
            .help(Copy.zoomOut)
            Button(Copy.zoomIn, systemImage: "plus.magnifyingglass") {
                if let zoom = viewer.zoomedIn { viewer.zoom = zoom }
            }
            .disabled(viewer.zoomedIn == nil)
            .help(Copy.zoomIn)
            // The shown magnification, and the three zooms that hold while the window is
            // resized, with the View menu's names (#458). In one group with Zoom Out and Zoom
            // In, so a narrow window keeps them together; the grid has no zoom, so no pop-up.
            if viewer.layout == .scroll {
                Menu {
                    Picker(Copy.zoom, selection: $viewer.zoom) {
                        Text(Copy.actualSize).tag(PageZoom.magnification(1))
                        Text(Copy.zoomToFit).tag(PageZoom.fitPage)
                        Text(Copy.zoomToWidth).tag(PageZoom.fitWidth)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } label: {
                    // The largest step's label, hidden, keeps the width the same at every
                    // zoom, so Zoom In never moves under the pointer.
                    ZStack {
                        Text(PageZoom.steps[PageZoom.steps.count - 1], format: Self.percent).hidden()
                        Text(viewer.magnification, format: Self.percent)
                    }
                    .monospacedDigit()
                }
                .help(Copy.zoom)
                .accessibilityLabel(Copy.zoom)
                .accessibilityValue(Text(viewer.magnification, format: Self.percent))
            }
        } label: {
            Label(Copy.zoom, systemImage: "magnifyingglass")
        }
    }
}
