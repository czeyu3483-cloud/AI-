import { randomUUID } from "crypto";
import type { InterviewSession, SessionEvent } from "./types";

const g = globalThis as unknown as { __sessions?: Map<string, InterviewSession> };
const store = g.__sessions ?? new Map<string, InterviewSession>();
g.__sessions = store;

export function newSessionId() {
  return randomUUID();
}

export function saveSession(session: InterviewSession) {
  store.set(session.id, session);
}

export function getSession(id: string) {
  return store.get(id);
}

export function pushEvent(session: InterviewSession, type: string, payload: unknown) {
  const event: SessionEvent = { t: new Date().toISOString(), type, payload };
  session.events.push(event);
}
