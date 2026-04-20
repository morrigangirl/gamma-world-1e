import type { DocSummary, FoundryDoc, MediaEntry, PackDescriptor } from "../../shared/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listPacks: () => fetch("/api/packs").then(json<PackDescriptor[]>),
  listDocs: (pack: string) => fetch(`/api/packs/${pack}/docs`).then(json<DocSummary[]>),
  readDoc: (pack: string, id: string) => fetch(`/api/packs/${pack}/docs/${id}`).then(json<FoundryDoc>),
  writeDoc: (pack: string, id: string, body: FoundryDoc) =>
    fetch(`/api/packs/${pack}/docs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(json<FoundryDoc>),
  createDoc: (pack: string, draft: Partial<FoundryDoc>) =>
    fetch(`/api/packs/${pack}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    }).then(json<FoundryDoc>),
  deleteDoc: (pack: string, id: string) =>
    fetch(`/api/packs/${pack}/docs/${id}`, { method: "DELETE" }).then(json<void>),
  listMedia: (relPath = "") =>
    fetch(`/api/media?path=${encodeURIComponent(relPath)}`).then(json<MediaEntry[]>),
  uploadMedia: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/media", { method: "POST", body: form }).then(json<MediaEntry>);
  }
};

export type StreamMessage =
  | { kind: "stdout" | "stderr"; line: string }
  | { kind: "exit"; code: number | null }
  | { kind: "error"; message: string };

export async function streamPost(url: string, body: unknown, onMessage: (m: StreamMessage) => void): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok || !res.body) {
    onMessage({ kind: "error", message: `HTTP ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onMessage(JSON.parse(dataLine.slice(5).trim()) as StreamMessage);
      } catch {
        // ignore malformed
      }
    }
  }
}
