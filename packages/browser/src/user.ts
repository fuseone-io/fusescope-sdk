import type { Attributes } from '@opentelemetry/api';

export interface User {
  id: string;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `crypto.subtle` exists only in secure contexts; hashing fails there rather than sending the raw id. */
export async function userAttributes(user: User | null, hash: boolean): Promise<Attributes> {
  if (!user) return {};
  if (!hash) return { 'user.id': user.id };
  return { 'user.hash': await sha256(user.id) };
}
