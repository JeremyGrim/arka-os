import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocleClient } from '../../../src/client/socle-client';
import { CLIError, CLIErrorCode } from '../../../src/utils/errors';

const resetEnv = () => {
  delete process.env.SOCLE_NOTIFY_TOKEN;
  delete process.env.SOCLE_ENFORCE_TLS;
  delete process.env.SOCLE_ALLOW_INSECURE_HTTP;
  delete process.env.ARKA_SOCLE_URL;
  delete process.env.NODE_ENV;
};

describe('SocleClient sécurité', () => {
  beforeEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it('ajoute le jeton SOCLE dans les en-têtes', () => {
    process.env.SOCLE_NOTIFY_TOKEN = 'cli-secret';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new SocleClient({ enforceTls: false });
    const axiosInstance = (client as any).client;
    expect(axiosInstance.defaults.headers.common.Authorization).toBe('Bearer cli-secret');
    expect(axiosInstance.defaults.headers.common['X-Socle-Token']).toBe('cli-secret');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('bloque les URL HTTP quand TLS est imposé', () => {
    process.env.SOCLE_ENFORCE_TLS = 'true';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let caught: CLIError | undefined;
    try {
      void new SocleClient({ baseUrl: 'http://localhost:8080' });
    } catch (error) {
      caught = error as CLIError;
    }

    expect(caught).toBeInstanceOf(CLIError);
    expect(caught?.code).toBe(CLIErrorCode.CONNECTION_FAILED);

    expect(warnSpy).toHaveBeenCalledWith(
      '[socle-client] TLS requis mais ARKA_SOCLE_URL=http://localhost:8080 utilise HTTP.'
    );
  });

  it('autorise HTTP en cas d’override explicite', () => {
    process.env.SOCLE_ENFORCE_TLS = 'true';
    process.env.SOCLE_ALLOW_INSECURE_HTTP = 'true';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => new SocleClient({ baseUrl: 'http://localhost:7070' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
