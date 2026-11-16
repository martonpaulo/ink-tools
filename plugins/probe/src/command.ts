import {NativeModules} from 'react-native';
import {answerLines, COMMAND_PATH, runCommand, UNKNOWN_ID, type HelperApi} from './helper';

type Reader = {readCommand(path: string): Promise<string>};

/**
 * One press of «Run Command»: read inkctl's command file, run it, and log the answer for inkctl to
 * read (`SNPROBE answer …` under ReactNativeJS). Never throws: an unreadable file is an answer too.
 */
export async function pressCommand(
  api: HelperApi,
  modules: Record<string, unknown> = NativeModules,
  log: (line: string) => void = line => console.log(line),
): Promise<void> {
  const reader = modules.ProbeProviders as Reader | undefined;
  let text: string;
  try {
    if (!reader?.readCommand) {
      throw new Error('native module ProbeProviders has no readCommand: build with `npm run build`');
    }
    text = await reader.readCommand(COMMAND_PATH);
  } catch (error) {
    // No file, no id: inkctl reads an `unknown` answer that follows its push as this press's failure.
    answerLines(UNKNOWN_ID, {ok: false, code: 1, message: `command file: ${(error as Error).message}`}).forEach(log);
    return;
  }
  const {id, answer} = await runCommand(text, api);
  answerLines(id, answer).forEach(log);
}
