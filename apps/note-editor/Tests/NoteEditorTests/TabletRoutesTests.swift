import Foundation
import NoteEditorKit
import Testing

@testable import NoteFormat

/// A defaults store in memory, so no test writes the app's own defaults.
final class MemoryPinStore: RoutePinStore {
    var values: [String: Any] = [:]
    func string(forKey key: String) -> String? { values[key] as? String }
    func set(_ value: Any?, forKey key: String) { values[key] = value }
    func removeObject(forKey key: String) { values[key] = nil }
}

/// The transport port of Settings › Tablet: what each route declares, the best one and the pin (#496).
@Suite struct TabletRoutesTests {
    static func routes(inkctlFound: Bool) -> TabletRoutes {
        TabletRoutes(
            [
                FileRoute(index: URL(filePath: "/nonexistent")),
                BrowseAccessRoute(),
                SupernoteCloudRoute(),
                DeviceLinkRoute(),
                InkctlRoute(copies: [], inkctlFound: { inkctlFound }),
            ],
            level: { id in Registry.items.first { $0.id == id }?.level })
    }

    @Test func everyRouteHasItsOwnStableID() {
        let ids = Self.routes(inkctlFound: true).all.map(\.id)
        #expect(Set(ids).count == ids.count)
        #expect(ids == ["file", "browseAccess", "supernoteCloud", "deviceLink", "advancedAdb"])
    }

    /// Notes are made on either side and sent whole; an edit of a note that exists is saved on the
    /// tablet by Device Link and the developer tool, in the cloud by Supernote Cloud, and on the Mac
    /// by the file route once #362 builds the Mac writer (owner, 2026-11-27).
    @Test func onlyARouteThroughTheTabletOrTheCloudSavesAnEditThereAndTheFileRouteOnlyOnTheMac() {
        let routes = Self.routes(inkctlFound: true).all
        func saving(_ place: RouteCapability) -> Set<String> {
            Set(routes.filter { $0.capabilities.contains(place) }.map(\.id))
        }
        #expect(saving(.saveOnTablet) == ["deviceLink", "advancedAdb"])
        #expect(saving(.saveInCloud) == ["supernoteCloud"])
        #expect(saving(.saveOnMac) == ["file"])
        let file = FileRoute(index: URL(filePath: "/nonexistent"))
        #expect(file.status(for: .saveOnMac) == .notBuilt(issue: 362))
        #expect(file.status(for: .read) == .available)
    }

    @Test func everyRouteDeclaresACapabilityAndAStatusForIt() {
        for route in Self.routes(inkctlFound: false).all {
            #expect(!route.capabilities.isEmpty, "\(route.id)")
            _ = route.status
        }
    }

    @Test func aRouteNotBuiltYetReadsOffWithItsIssue() {
        let routes = Self.routes(inkctlFound: false).all
        let statuses = Dictionary(uniqueKeysWithValues: routes.map { ($0.id, $0.status) })
        #expect(statuses["file"] == .available)
        #expect(statuses["browseAccess"] == .notBuilt(issue: 497))
        #expect(statuses["deviceLink"] == .notBuilt(issue: 493))
        #expect(statuses["supernoteCloud"] == .notBuilt(issue: 363))
        #expect(statuses["advancedAdb"] == .notBuilt(issue: 498))
        #expect(Self.routes(inkctlFound: true).all.last?.status == .available)
    }

    @Test func theSaveDestinationsComeFromTheAdaptersAndTheDefaultIsTheTabletThenTheMac() {
        let found = Self.routes(inkctlFound: true)
        #expect(found.destinations == [.saveOnTablet, .saveOnMac, .saveInCloud])
        #expect(found.editDestination(chosen: nil) == .saveOnTablet)
        // The Mac before #362, and the cloud before #363: the choice reads unavailable, edits go to the default.
        #expect(found.editDestination(chosen: .saveOnMac) == .saveOnTablet)
        #expect(found.editDestination(chosen: .saveInCloud) == .saveOnTablet)
        #expect(!found.canSave(at: .saveOnMac))
        // No route can save an edit yet when inkctl is missing: nil, never a made-up place.
        #expect(Self.routes(inkctlFound: false).editDestination(chosen: nil) == nil)
    }

    @Test func withNoPinTheBestAvailableRouteIsUsed() {
        #expect(Self.routes(inkctlFound: true).inUse(pin: nil)?.id == "advancedAdb")
        #expect(Self.routes(inkctlFound: false).inUse(pin: nil)?.id == "file")
    }

    @Test func aPinnedRouteWinsAndAnUnknownPinReadsAsAutomatic() {
        #expect(Self.routes(inkctlFound: true).inUse(pin: "file")?.id == "file")
        // A pin the Mac cannot use stays the pin: the screen shows what it misses.
        #expect(Self.routes(inkctlFound: false).inUse(pin: "advancedAdb")?.id == "advancedAdb")
        #expect(Self.routes(inkctlFound: true).inUse(pin: "a route of a later version")?.id == "advancedAdb")
    }

    @Test func aRoutesLevelIsItsMostFragileItems() {
        let routes = Self.routes(inkctlFound: true)
        guard let inkctl = routes.all.last else { return }
        let levels = inkctl.registryItems.compactMap { id in Registry.items.first { $0.id == id }?.level }
        #expect(levels.count == inkctl.registryItems.count, "every item the route names is in the Swift reader")
        #expect(routes.level(of: inkctl) == levels.max())
        #expect(routes.level(of: BrowseAccessRoute()) == nil)
    }

    @Test func thePinIsKeptByIDAndRemovedForAutomatic() {
        let store = MemoryPinStore()
        let pin = TabletRoutePin(store: store)
        #expect(pin.id == nil)
        #expect(pin.destination == nil)
        pin.destination = .saveOnMac
        #expect(store.values[TabletRoutePin.destinationKey] as? String == "saveOnMac")
        // A stored value that names no save destination reads as the default.
        store.values[TabletRoutePin.destinationKey] = "read"
        #expect(pin.destination == nil)
        store.values[TabletRoutePin.destinationKey] = "from a later version"
        #expect(pin.destination == nil)
        pin.destination = nil
        #expect(store.values[TabletRoutePin.destinationKey] == nil)
        pin.id = "file"
        #expect(store.values[TabletRoutePin.key] as? String == "file")
        #expect(TabletRoutePin(store: store).id == "file")
        pin.id = nil
        #expect(store.values[TabletRoutePin.key] == nil)
    }

    @Test func theBytesOfFoldersAreTheirFilesAndAMissingFolderIsZero() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "folder-bytes-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: folder) }
        try FileManager.default.createDirectory(at: folder.appending(path: "inner"), withIntermediateDirectories: true)
        try Data(count: 5000).write(to: folder.appending(path: "inner/a"))
        try Data(count: 3000).write(to: folder.appending(path: "b"))
        #expect((AppFolders.bytes(of: [folder]) ?? 0) >= 8000)
        #expect(AppFolders.bytes(of: [folder.appending(path: "missing")]) == 0)
    }
}
