package com.supernotetools.lingo;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * The Needs and Error states say what ui-kit's say (#258): the shared button words equal
 * packages/ui-kit/src/problem.ts, each Needs has a what and a why, and an Error splits its
 * sentence into a reason and what to try. Argument: the app folder, as WatcherCommandTest has it.
 */
public final class ProblemStatesTest {
  public static void main(String[] args) throws IOException {
    Path problem = Paths.get(args[0]).resolve("../../packages/ui-kit/src/problem.ts").normalize();
    String source = new String(Files.readAllBytes(problem), StandardCharsets.UTF_8);
    LanguageCycleTest.check(source.contains("CLOSE_TEXT = '" + Copy.CLOSE + "'"), "Close is ui-kit's word");
    LanguageCycleTest.check(source.contains("RETRY_TEXT = '" + Copy.RETRY + "'"), "Retry is ui-kit's word");

    String[][] needs = {
        {Copy.NEEDS_FILES_WHAT, Copy.NEEDS_FILES_WHY},
        {Copy.NEEDS_OVERLAY_WHAT, Copy.NEEDS_OVERLAY_WHY},
        {Copy.NEEDS_WATCHER_WHAT, Copy.NEEDS_WATCHER_WHY}};
    for (String[] state : needs) {
      LanguageCycleTest.check(state[0].endsWith(".") && !state[1].isEmpty(), "a Needs state has its what and its why: " + state[0]);
    }
    for (FileFailure.Kind kind : FileFailure.Kind.values()) {
      String sentence = Copy.failure(kind);
      String reason = Copy.reason(sentence);
      String next = Copy.next(sentence);
      LanguageCycleTest.check(reason.endsWith("."), kind + " has a reason");
      LanguageCycleTest.check(next == null || next.endsWith("."), kind + " has a next step or none");
      LanguageCycleTest.check(sentence.equals(next == null ? reason : reason + " " + next), kind + " splits without loss");
    }
    System.out.println("ProblemStatesTest ok");
  }
}
