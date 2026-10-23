import type { LogRecord } from '@opentelemetry/api-logs';
import { beforeEach, describe, expect, it } from 'vitest';
import { actionTarget, withActionTarget } from '../src/actions';

const el = (selector: string) => document.querySelector(selector) as Element;

describe('actionTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="add-to-cart"><span class="label">Add to cart</span></button>
      <nav aria-label="Main"><a class="nav-link active" href="/docs">Docs</a></nav>
      <div data-fusescope-action="checkout"><button class="btn primary" type="button">Pay</button></div>
      <button aria-label="Close dialog">×</button>
      <button id="row-123456" class="row-action">Delete</button>
      <input id="email" value="a@b.c" />
      <p><b>plain text</b></p>`;
  });

  it.each([
    ['#add-to-cart span', 'button#add-to-cart'],
    ['a.nav-link', 'a.nav-link'],
    ['div[data-fusescope-action] button', 'div[data-fusescope-action="checkout"]'],
    ['button[aria-label]', 'button[aria-label="Close dialog"]'],
    ['button.row-action', 'button.row-action'],
    ['#email', 'input#email'],
    ['p b', 'b'],
  ])('%s → %s', (selector, want) => {
    expect(actionTarget(el(selector))).toBe(want);
  });

  it('never captures text or input values', () => {
    const all = ['#add-to-cart span', '#email', 'p b'].map((s) => actionTarget(el(s))).join(' ');
    for (const leak of ['Add to cart', 'a@b.c', 'plain text']) expect(all).not.toContain(leak);
  });
});

describe('withActionTarget', () => {
  it('resolves the target from the upstream CSS selector', () => {
    document.body.innerHTML = '<main><button id="buy"><span>Buy</span></button></main>';
    const record: LogRecord = { attributes: { 'browser.css_selector': '#buy > span:nth-child(1)' } };
    withActionTarget(record);
    expect(record.attributes?.['fusescope.rum.action.target']).toBe('button#buy');
  });

  it('leaves records without a resolvable selector alone', () => {
    const record: LogRecord = { attributes: { 'browser.css_selector': ':::' } };
    withActionTarget(record);
    expect(record.attributes).not.toHaveProperty('fusescope.rum.action.target');
  });
});
