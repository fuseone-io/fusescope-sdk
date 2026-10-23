import type { LogRecord } from '@opentelemetry/api-logs';

const EXPLICIT = '[data-fusescope-action]';
const ACTIONABLE =
  'button,a,input,select,textarea,summary,label,[aria-label],[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=option]';
const GENERATED_ID = /\d{4}|^:/;

const quoted = (v: string) => `"${v.slice(0, 64).replace(/["\\]/g, '\\$&')}"`;

/**
 * A stable selector of the element a click acts on: the closest `data-fusescope-action`, else the closest
 * actionable element by id, `aria-label` or first class (later ones are often state). Text and input values are never read.
 */
export function actionTarget(clicked: Element): string {
  const explicit = clicked.closest(EXPLICIT);
  const el = explicit ?? clicked.closest(ACTIONABLE) ?? clicked;
  const tag = el.localName;
  if (explicit) return `${tag}[data-fusescope-action=${quoted(el.getAttribute('data-fusescope-action') ?? '')}]`;
  if (el.id && !GENERATED_ID.test(el.id)) return `${tag}#${CSS.escape(el.id)}`;
  const label = el.getAttribute('aria-label');
  if (label) return `${tag}[aria-label=${quoted(label)}]`;
  const cls = el.classList[0];
  return cls ? `${tag}.${CSS.escape(cls)}` : tag;
}

/** Upstream's click hook gets the record only, so the element is found again from its CSS selector. */
export function withActionTarget(record: LogRecord): void {
  const selector = record.attributes?.['browser.css_selector'];
  if (typeof selector !== 'string') return;
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return;
  }
  if (el) record.attributes = { ...record.attributes, 'fusescope.rum.action.target': actionTarget(el) };
}
