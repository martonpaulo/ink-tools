import {RemoteTask, TaskContent, TaskProvider} from './tasks';

/**
 * Todoist as a TaskProvider, over the REST API v1 (https://developer.todoist.com/api/v1/).
 * `fetch` is injected so the unit tests run with no network and no token; the token comes from the
 * owner's secure store at runtime and never from the repository.
 * Not yet run against a live account: the owner verifies it on the Mac (issue #44).
 */
export interface TodoistOptions {
  token: string;
  fetch: (url: string, init: {method: string; headers: Record<string, string>; body?: string}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }>;
  baseUrl?: string;
}

interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  checked?: boolean;
  due?: {date?: string; datetime?: string} | null;
  updated_at?: string | null;
}

/** shortcut: due keeps whole seconds and a date-only due reads as UTC midnight; revisit with time zones. */
export function fromTodoist(t: TodoistTask): RemoteTask {
  const stamp = t.due?.datetime ?? (t.due?.date ? `${t.due.date}T00:00:00Z` : null);
  const due = stamp ? Date.parse(stamp) : NaN;
  const modified = t.updated_at ? Date.parse(t.updated_at) : NaN;
  return {
    remoteId: String(t.id),
    title: t.content,
    detail: t.description ?? '',
    due: Number.isNaN(due) ? null : due,
    completed: t.checked === true,
    modified: Number.isNaN(modified) ? 0 : modified,
  };
}

/** The create/update body. A null due clears the date (`due_string: "no date"`). */
export function toTodoistBody(c: TaskContent): Record<string, unknown> {
  const body: Record<string, unknown> = {content: c.title, description: c.detail};
  if (c.due === null) body.due_string = 'no date';
  else body.due_datetime = new Date(c.due).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return body;
}

export function createTodoistProvider(opts: TodoistOptions): TaskProvider {
  const base = opts.baseUrl ?? 'https://api.todoist.com/api/v1';
  const call = async (method: string, path: string, body?: unknown, allow404 = false) => {
    const res = await opts.fetch(`${base}${path}`, {
      method,
      headers: {Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`Todoist ${method} ${path} failed with HTTP ${res.status}`);
    return res.status === 204 ? null : ((await res.json()) as unknown);
  };
  const setChecked = async (id: string, completed: boolean, wasCompleted: boolean) => {
    if (completed !== wasCompleted) await call('POST', `/tasks/${id}/${completed ? 'close' : 'reopen'}`);
  };

  return {
    async list() {
      const out: RemoteTask[] = [];
      let cursor: string | null = null;
      do {
        const page = (await call('GET', `/tasks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)) as {
          results: TodoistTask[];
          next_cursor?: string | null;
        };
        out.push(...page.results.map(fromTodoist));
        cursor = page.next_cursor ?? null;
      } while (cursor);
      return out;
    },
    async get(remoteId) {
      const t = (await call('GET', `/tasks/${remoteId}`, undefined, true)) as TodoistTask | null;
      return t ? fromTodoist(t) : null;
    },
    async create(c) {
      const t = (await call('POST', '/tasks', toTodoistBody(c))) as TodoistTask;
      await setChecked(String(t.id), c.completed, false);
      return {...fromTodoist(t), completed: c.completed};
    },
    async update(remoteId, c) {
      const before = await this.get(remoteId);
      if (!before) throw new Error(`Todoist task ${remoteId} no longer exists`);
      const t = (await call('POST', `/tasks/${remoteId}`, toTodoistBody(c))) as TodoistTask;
      await setChecked(remoteId, c.completed, before.completed);
      return {...fromTodoist(t), completed: c.completed};
    },
    async remove(remoteId) {
      await call('DELETE', `/tasks/${remoteId}`, undefined, true);
    },
  };
}
