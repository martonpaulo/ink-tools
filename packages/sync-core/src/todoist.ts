import {HttpFetch, requireHttps} from './http';
import services from './services.json';
import {RemoteTask, TaskContent, TaskList, TaskProvider} from './tasks';

/**
 * Todoist as a TaskProvider, over the REST API v1 (https://developer.todoist.com/api/v1/).
 * `fetch` is injected so the unit tests run with no network and no token; the token comes from the
 * owner's secure store at runtime and never from the repository.
 * Not yet run against a live account: the owner verifies it on the Mac (issue #44).
 */
export interface TodoistOptions {
  token: string;
  fetch: HttpFetch<{json(): Promise<unknown>; text(): Promise<string>}>;
  baseUrl?: string;
}

interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  checked?: boolean;
  due?: {date?: string; datetime?: string} | null;
  updated_at?: string | null;
  project_id?: string | null;
}

interface TodoistProject {
  id: string;
  name: string;
  /** API v1's flag; REST v2 called it `is_inbox_project`. */
  inbox_project?: boolean;
  is_inbox_project?: boolean;
}

/** A project as the tablet files it: by name, the Inbox marked (#212). */
export function projectList(p: TodoistProject): TaskList {
  return {name: p.name, inbox: p.inbox_project === true || p.is_inbox_project === true};
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
  // shortcut: a due at exactly UTC midnight is how a date-only due reads back (#66), so it is
  // written as `due_date`; a task genuinely timed at 00:00 UTC turns date-only. Upgrade with an all-day flag.
  else if (c.due % 86400000 === 0) body.due_date = new Date(c.due).toISOString().slice(0, 10);
  else body.due_datetime = new Date(c.due).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return body;
}

/**
 * The account the token is signed in to (#433), from API v1's `GET /user` with the same token: its
 * email, with the name before it when both are there. A failed read throws with the HTTP status only.
 */
export async function fetchTodoistAccount(opts: TodoistOptions): Promise<string> {
  const base = requireHttps(opts.baseUrl ?? services.todoistApi, 'Todoist base URL');
  const res = await opts.fetch(`${base}/user`, {method: 'GET', headers: {Authorization: `Bearer ${opts.token}`}});
  if (!res.ok) throw new Error(`Todoist GET /user failed with HTTP ${res.status}`);
  const user = (await res.json()) as {email?: unknown; full_name?: unknown} | null;
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  const name = typeof user?.full_name === 'string' ? user.full_name.trim() : '';
  if (!email) throw new Error('Todoist GET /user answered with no email');
  return name && name !== email ? `${name} (${email})` : email;
}

export function createTodoistProvider(opts: TodoistOptions): TaskProvider {
  const base = requireHttps(opts.baseUrl ?? services.todoistApi, 'Todoist base URL');
  const enc = encodeURIComponent; // an id is one path segment, never a path (#81)
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
    if (completed !== wasCompleted) await call('POST', `/tasks/${enc(id)}/${completed ? 'close' : 'reopen'}`);
  };

  /** Every item of a paginated list endpoint. */
  const all = async <T>(path: string): Promise<T[]> => {
    const out: T[] = [];
    let cursor: string | null = null;
    do {
      const page = (await call('GET', `${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)) as {
        results: T[];
        next_cursor?: string | null;
      };
      out.push(...page.results);
      cursor = page.next_cursor ?? null;
    } while (cursor);
    return out;
  };

  return {
    async list() {
      const projects = new Map((await all<TodoistProject>('/projects')).map(p => [String(p.id), projectList(p)]));
      return (await all<TodoistTask>('/tasks')).map(t => {
        const list = t.project_id ? projects.get(String(t.project_id)) : undefined;
        return list ? {...fromTodoist(t), list} : fromTodoist(t);
      });
    },
    async get(remoteId) {
      const t = (await call('GET', `/tasks/${enc(remoteId)}`, undefined, true)) as TodoistTask | null;
      return t ? fromTodoist(t) : null;
    },
    async create(c) {
      const t = (await call('POST', '/tasks', toTodoistBody(c))) as TodoistTask;
      await setChecked(String(t.id), c.completed, false);
      return {...fromTodoist(t), completed: c.completed};
    },
    async update(remoteId, c) {
      const before = await this.get(remoteId);
      if (!before) return null;
      const t = (await call('POST', `/tasks/${enc(remoteId)}`, toTodoistBody(c), true)) as TodoistTask | null;
      if (!t) return null;
      await setChecked(remoteId, c.completed, before.completed);
      return {...fromTodoist(t), completed: c.completed};
    },
    async remove(remoteId) {
      await call('DELETE', `/tasks/${enc(remoteId)}`, undefined, true);
    },
  };
}
