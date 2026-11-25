package com.martonpaulo.inktools.bridge;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
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
    nameCheck();
    System.out.println("RegistryTest ok");
  }

  /** Each call goes out only when PluginHost's Stub gives its number to the method the registry names (#294). */
  private static void nameCheck() {
    Map<String, Integer> stub = new HashMap<>();
    stub.put("installPlugin", 1);
    stub.put("uninstallPlugin", 5);
    stub.put("setPluginEnable", 6);
    stub.put("updatePluginPermissions", 9);
    for (int code : new int[] {HostCalls.INSTALL, HostCalls.UNINSTALL, HostCalls.SET_ENABLE, HostCalls.UPDATE_PERMISSIONS}) {
      HostCallsTest.check(HostCalls.refusal(stub, code) == null, "call " + code + " passes against today's Stub");
    }
    Map<String, Integer> reordered = new HashMap<>(stub);
    reordered.put("uninstallPlugin", 4);
    reordered.put("setPluginEnable", 5);
    String refused = HostCalls.refusal(reordered, HostCalls.UNINSTALL);
    HostCallsTest.check(refused != null && refused.contains("uninstallPlugin 4, not 5"), "a reordered uninstall is refused: " + refused);
    HostCallsTest.check(HostCalls.refusal(reordered, HostCalls.INSTALL) == null, "an unchanged call still passes");
    refused = HostCalls.refusal(new HashMap<>(), HostCalls.INSTALL);
    HostCallsTest.check(refused != null && refused.contains("cannot be checked"), "a Stub with no constants is refused: " + refused);
    HostCallsTest.check(HostCalls.refusal(stub, 2) != null, "a number the registry does not name is refused");
  }
}
