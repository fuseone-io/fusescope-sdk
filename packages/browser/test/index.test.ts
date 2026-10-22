import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rum = {
  addError: vi.fn(),
  addAction: vi.fn(),
  setView: vi.fn(),
  setUser: vi.fn(() => Promise.resolve()),
  shutdown: vi.fn(() => Promise.resolve()),
};
const startRum = vi.fn(() => rum);
vi.mock('../src/sdk', () => ({ startRum }));

const config = { applicationId: 'a', publicKey: 'rum_pub_1', endpoint: 'https://f.example' };

describe('public API', () => {
  let api: typeof import('../src/index');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    api = await import('../src/index');
  });

  afterEach(async () => {
    await api.shutdown();
  });

  it('starts once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.init(config);
    api.init(config);
    expect(startRum).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('waits for consent when required', async () => {
    api.init({ ...config, requireConsent: true });
    api.addError(new Error('before consent'));
    expect(startRum).not.toHaveBeenCalled();
    await api.setConsent(true);
    expect(startRum).toHaveBeenCalledOnce();
    expect(rum.addError).not.toHaveBeenCalled();
  });

  it('stops when consent is withdrawn and resumes when granted again', async () => {
    api.init(config);
    await api.setConsent(false);
    expect(rum.shutdown).toHaveBeenCalledOnce();
    await api.setConsent(true);
    expect(startRum).toHaveBeenCalledTimes(2);
  });

  it('ignores consent before init', async () => {
    await api.setConsent(true);
    expect(startRum).not.toHaveBeenCalled();
  });

  it('applies a user set before start', async () => {
    await api.setUser({ id: 'u' });
    api.init(config);
    await Promise.resolve();
    expect(rum.setUser).toHaveBeenCalledWith({ id: 'u' });
  });

  it('forwards calls once started', () => {
    api.init(config);
    api.addError('e', { k: 'v' });
    api.addAction('buy');
    api.setView('/p/:id');
    expect(rum.addError).toHaveBeenCalledWith('e', { k: 'v' });
    expect(rum.addAction).toHaveBeenCalledWith('buy', undefined);
    expect(rum.setView).toHaveBeenCalledWith('/p/:id');
  });

  it('rejects an invalid config without throwing into the page', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.init({ ...config, endpoint: 'nope' });
    expect(startRum).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it('shuts down and can start again', async () => {
    api.init(config);
    await api.shutdown();
    expect(rum.shutdown).toHaveBeenCalledOnce();
    api.init(config);
    expect(startRum).toHaveBeenCalledTimes(2);
  });
});
