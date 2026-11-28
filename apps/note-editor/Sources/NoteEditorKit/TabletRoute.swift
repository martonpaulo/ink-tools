import Foundation

/// What a route can do with a note (owner, 2026-11-27, #496). Reading and editing are separate,
/// since the tablet writes: a note is made on either side and sent whole either way, and an edit
/// of a note that exists is saved on the tablet, on the Mac or in Supernote Cloud, as the person
/// chooses in Settings › Tablet.
public enum RouteCapability: String, CaseIterable, Sendable {
    /// Open and read a note.
    case read
    /// Make a new note.
    case create
    /// Send a whole note from the Mac to the tablet.
    case sendToTablet
    /// Send a whole note from the tablet to the Mac.
    case sendToMac
    /// Save an edit of a note that exists on the tablet, which writes it.
    case saveOnTablet
    /// Save an edit on the Mac, with the Mac's own writer (#362).
    case saveOnMac
    /// Save an edit in Supernote Cloud, which applies it (#363).
    case saveInCloud

    /// The three places an edit is saved, in the order the default prefers them.
    public static let saveDestinations: [RouteCapability] = [.saveOnTablet, .saveOnMac, .saveInCloud]
}

/// What a route needs before it works, in this repository's words.
public enum RouteRequirement: String, CaseIterable, Sendable {
    case noteFileOnMac
    case sameWiFi
    case browseAndAccessOn
    case cloudAccount
    case deviceLinkPlugin
    case sideloadingOn
    case cableOrWiFi
    /// The developer tool `inkctl` on this Mac, until Advanced mode is built in (#498).
    case inkctl
}

/// How fast a route moves a note, as a class the screen names.
public enum RouteSpeed: String, Sendable {
    /// The note is already on this Mac.
    case instant
    /// A cable, or slower over Wi-Fi.
    case cableOrWiFi
    /// As fast as the local Wi-Fi.
    case wiFi
    /// As fast as the internet and the tablet's own sync.
    case internet
}

/// A route's status dot: available now, one step missing, or off.
public enum RouteStatus: Equatable, Sendable {
    case available
    /// The route works once the person meets this requirement.
    case stepMissing(RouteRequirement)
    /// The route is not built yet; its issue builds it.
    case notBuilt(issue: Int)

    public var isAvailable: Bool { self == .available }
}

/// One way Note Editor reaches the tablet: the transport port, with one adapter per route (#496).
/// Every value is declared data: the screen lists what the adapters declare and holds none itself.
public protocol TabletRoute: Sendable {
    /// Stable: the pin stores it, so it never changes after a release.
    var id: String { get }
    var capabilities: Set<RouteCapability> { get }
    var requirements: [RouteRequirement] { get }
    /// The registry items the route depends on; its device-access level is their most fragile one.
    var registryItems: [String] { get }
    var speed: RouteSpeed { get }
    /// The folders whose disk the route uses, measured on screen (#485).
    var folders: [URL] { get }
    /// Whether the route can do `capability` now; a capability it does not declare is never asked.
    func status(for capability: RouteCapability) -> RouteStatus
}

extension TabletRoute {
    /// The route's dot: available when any capability is, else its first capability's status.
    /// Every route declares at least one capability, which `TabletRoutesTests` checks.
    public var status: RouteStatus {
        let all = RouteCapability.allCases.filter(capabilities.contains).map(status(for:))
        return all.first(where: \.isAvailable) ?? all[0]
    }
}

/// The routes the composition root registers, the pin, and the route in use.
public struct TabletRoutes: Sendable {
    public let all: [any TabletRoute]
    /// The level of a registry item, 1 the highest and least fragile; the app reads it from the registry.
    private let level: @Sendable (String) -> Int?

    public init(_ all: [any TabletRoute], level: @escaping @Sendable (String) -> Int?) {
        self.all = all
        self.level = level
    }

    /// A route's device-access level: its most fragile registry item's, `nil` with none known.
    public func level(of route: any TabletRoute) -> Int? {
        route.registryItems.compactMap(level).max()
    }

    /// The best available route: the most capabilities available now first, then the least
    /// fragile level, so the order comes from what the adapters declare, never a list.
    public var best: (any TabletRoute)? {
        func ready(_ route: any TabletRoute) -> Int {
            route.capabilities.filter { route.status(for: $0).isAvailable }.count
        }
        return all.filter { $0.status.isAvailable }.min { lhs, rhs in
            if ready(lhs) != ready(rhs) { return ready(lhs) > ready(rhs) }
            return (level(of: lhs) ?? Int.max) < (level(of: rhs) ?? Int.max)
        }
    }

    /// The route in use: the pinned one when it is registered, whatever its status, else the best.
    public func inUse(pin: String?) -> (any TabletRoute)? {
        all.first { $0.id == pin } ?? best
    }

    /// The save destinations some registered route declares, in `saveDestinations` order.
    public var destinations: [RouteCapability] {
        RouteCapability.saveDestinations.filter { place in all.contains { $0.capabilities.contains(place) } }
    }

    /// Whether some registered route can save an edit at `place` now.
    public func canSave(at place: RouteCapability) -> Bool {
        all.contains { $0.capabilities.contains(place) && $0.status(for: place).isAvailable }
    }

    /// Where an edit is saved: the chosen place when a route can save there now, else the tablet
    /// when one can, else the Mac (owner, 2026-11-27); `nil` when no route can save an edit yet.
    public func editDestination(chosen: RouteCapability?) -> RouteCapability? {
        if let chosen, canSave(at: chosen) { return chosen }
        return [RouteCapability.saveOnTablet, .saveOnMac].first(where: canSave(at:))
    }
}

/// Where the pinned route is kept: one key of the app's defaults (bench-apple-app-shell
/// settings-persistence.md, One owner), the route's id, and no value for Automatic.
public protocol RoutePinStore: AnyObject {
    func string(forKey key: String) -> String?
    func set(_ value: Any?, forKey key: String)
    func removeObject(forKey key: String)
}

extension UserDefaults: RoutePinStore {}

public final class TabletRoutePin {
    /// Stable after a release.
    public static let key = "tabletRoutePin"
    public static let destinationKey = "editDestinationPin"

    private let store: RoutePinStore

    public init(store: RoutePinStore = UserDefaults.standard) {
        self.store = store
    }

    /// The pinned route's id, or `nil` for Automatic.
    public var id: String? {
        get { store.string(forKey: Self.key) }
        set {
            if let newValue { store.set(newValue, forKey: Self.key) } else { store.removeObject(forKey: Self.key) }
        }
    }

    /// The chosen save destination, or `nil` for the default; an unknown stored value reads as the default.
    public var destination: RouteCapability? {
        get {
            store.string(forKey: Self.destinationKey).flatMap(RouteCapability.init(rawValue:))
                .filter(RouteCapability.saveDestinations.contains)
        }
        set {
            if let newValue {
                store.set(newValue.rawValue, forKey: Self.destinationKey)
            } else {
                store.removeObject(forKey: Self.destinationKey)
            }
        }
    }
}
