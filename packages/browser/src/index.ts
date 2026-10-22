import type { Attributes } from '@opentelemetry/api';
import { type BrowserConfig, type ResolvedConfig, resolveConfig } from './config';
import { type Rum, startRum } from './sdk';
import type { User } from './user';
import { SDK_VERSION } from './version';

export type { BrowserConfig, InstrumentationsConfig, PrivacyConfig, SessionConfig } from './config';
export type { User } from './user';
export type { Attributes };
export const VERSION = SDK_VERSION;

let config: ResolvedConfig | undefined;
let consented = false;
let rum: Rum | undefined;
let pendingUser: User | null | undefined;

function start(): void {
  if (!config || !consented || rum) return;
  rum = startRum(config);
  if (pendingUser !== undefined) void rum.setUser(pendingUser);
}

async function stop(): Promise<void> {
  const r = rum;
  rum = undefined;
  await r?.shutdown();
}

/** Starts FuseScope RUM; with `requireConsent`, collection waits for `setConsent(true)`. */
export function init(options: BrowserConfig): void {
  if (config) {
    console.warn('FuseScope: init() was already called; ignoring');
    return;
  }
  try {
    config = resolveConfig(options);
  } catch (e) {
    console.error((e as Error).message);
    return;
  }
  consented = !config.requireConsent;
  start();
}

/** Grants (starts collection) or withdraws (flushes and stops it) the user's consent. */
export async function setConsent(granted: boolean): Promise<void> {
  consented = granted;
  if (granted) start();
  else await stop();
}

/** Identifies the user (opt-in). Sent as a SHA-256 `user.hash` unless `privacy.hashUserId` is `false`. `null` clears it. */
export function setUser(user: User | null): Promise<void> {
  pendingUser = user;
  return rum ? rum.setUser(user) : Promise.resolve();
}

/** Reports a handled error. */
export function addError(error: unknown, attributes?: Attributes): void {
  rum?.addError(error, attributes);
}

/** Reports a custom user action, e.g. `addAction('checkout')`. */
export function addAction(name: string, attributes?: Attributes): void {
  rum?.addAction(name, attributes);
}

/** Names the current view with a route template, e.g. `setView('/orders/:id')`. */
export function setView(route: string): void {
  rum?.setView(route);
}

/** Flushes pending data and stops collection; `init()` may be called again afterwards. */
export async function shutdown(): Promise<void> {
  config = undefined;
  consented = false;
  pendingUser = undefined;
  await stop();
}
