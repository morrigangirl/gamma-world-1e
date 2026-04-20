import { randomBytes } from "node:crypto";

const ID_RE = /^[A-Za-z0-9_-]{16}$/;

export function newId(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function keyFor(collection: string, id: string): string {
  return `!${collection}!${id}`;
}

export function embeddedKey(parentCollection: string, childCollection: string, parentId: string, childId: string): string {
  return `!${parentCollection}.${childCollection}!${parentId}.${childId}`;
}
