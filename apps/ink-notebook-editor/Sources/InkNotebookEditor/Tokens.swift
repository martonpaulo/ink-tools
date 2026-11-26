import AppKit
import SwiftUI

/// The app's colour tokens, one owner for each colour a view sets by hand.
enum Tokens {
    /// Text in the sidebar: AppKit's label colour, without vibrancy. SwiftUI draws `.primary`
    /// text on the sidebar's glass as vibrant text, through a compositing filter, and an
    /// off-screen render (`cacheDisplay`, which renders layers as `CALayer.render(in:)` does)
    /// leaves compositing filters out, so every dark render drew the sidebar's text dark on dark
    /// (#420). The label colour draws light in dark mode with no filter, on screen and in the
    /// renders.
    static let sidebarText = Color(nsColor: .labelColor)
    /// Text on a selected sidebar row, whose background is the accent: AppKit's text on a
    /// selection, light in both appearances.
    static let selectedSidebarText = Color(nsColor: .alternateSelectedControlTextColor)

    /// The sidebar's text colour for a row drawn on `prominence`.
    static func sidebarText(on prominence: BackgroundProminence) -> Color {
        prominence == .increased ? selectedSidebarText : sidebarText
    }
}
