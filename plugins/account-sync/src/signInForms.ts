/**
 * What each provider needs to connect on the tablet, declared in data (#487, the declared-dependency
 * rule of #245): the fields a person types and how they become the stored secret, or why that
 * provider cannot connect on the tablet yet. Settings draws the form from this table alone.
 */
import {composeICloudSignIn, type SecretProvider} from '@ink-tools/sync-core/secrets';
import type {CopyKey} from './copy';

export type SignInField = {
  key: string;
  label: CopyKey;
  /** A password or token: typed hidden. */
  secure: boolean;
  email?: boolean;
};

export type Composed = {ok: true; secret: string} | {ok: false; problem: CopyKey};

export type SignInForm =
  | {
      kind: 'typed';
      fields: SignInField[];
      /** Where the person finds the value, under the fields. */
      about: CopyKey;
      compose(values: Record<string, string>): Composed;
    }
  /** No tablet route yet: the Needs state says why, with no step. */
  | {kind: 'unavailable'; reason: CopyKey};

const filled = (values: Record<string, string>, key: string) => (values[key] ?? '').trim();

export const SIGN_IN_FORMS: Partial<Record<SecretProvider, SignInForm>> = {
  todoist: {
    kind: 'typed',
    fields: [{key: 'token', label: 'connect.todoist.token', secure: true}],
    about: 'connect.todoist.about',
    compose: values => {
      const token = filled(values, 'token');
      return token ? {ok: true, secret: token} : {ok: false, problem: 'connect.empty'};
    },
  },
  icloud: {
    kind: 'typed',
    fields: [
      {key: 'appleId', label: 'connect.icloud.appleId', secure: false, email: true},
      {key: 'password', label: 'connect.icloud.appSpecific', secure: true},
    ],
    about: 'connect.icloud.about',
    compose: values => {
      const appleId = filled(values, 'appleId');
      const password = filled(values, 'password');
      if (!appleId || !password) {
        return {ok: false, problem: 'connect.empty'};
      }
      if (appleId.includes(':')) {
        return {ok: false, problem: 'connect.icloud.colon'};
      }
      return {ok: true, secret: composeICloudSignIn(appleId, password)};
    },
  },
  // Google signs in through the published app's own sign-in on the tablet, once it exists (#372).
  google: {kind: 'unavailable', reason: 'connect.google.unavailable'},
};
