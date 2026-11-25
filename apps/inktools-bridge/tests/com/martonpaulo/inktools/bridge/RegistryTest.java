package com.martonpaulo.inktools.bridge;

import java.util.HashSet;
import java.util.Set;

/** The generated registry reader loads and agrees with the call encoding: run by `node scripts/build.cjs --test` (#294). */
public final class RegistryTest {
  public static void main(String[] args) {
    Set<String> ids = new HashSet<>();
    for (Registry.Item item : Registry.ITEMS) {
      HostCallsTest.check(ids.add(item.id), item.id + " is listed once");
      HostCallsTest.check(item.level >= 1 && item.level <= 5, item.id + " has a level from 1 to 5");
      HostCallsTest.check((item.probe == null) != (item.unprobed == null), item.id + " has a probe or an unprobed reason");
    }
    HostCallsTest.check(ids.contains("pluginhost.call-numbers"), "the call numbers are in the reader");
    HostCallsTest.check(HostCalls.INSTALL == Registry.PluginhostCallNumbers.INSTALL, "install's number is the registry's");
    HostCallsTest.check(HostCalls.UNINSTALL == Registry.PluginhostCallNumbers.UNINSTALL, "uninstall's number is the registry's");
    HostCallsTest.check(HostCalls.SET_ENABLE == Registry.PluginhostCallNumbers.SET_ENABLE, "setEnable's number is the registry's");
    HostCallsTest.check(HostCalls.UPDATE_PERMISSIONS == Registry.PluginhostCallNumbers.UPDATE_PERMISSIONS, "updatePermissions' number is the registry's");
    HostCallsTest.check(HostCalls.DESCRIPTOR.equals(Registry.PluginhostSettingService.DESCRIPTOR), "the descriptor is the registry's");
    System.out.println("RegistryTest ok");
  }
}
