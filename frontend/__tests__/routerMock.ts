import { vi } from 'vitest';

/** Stand-in for next/navigation's router (the app router is not mounted in unit tests). */
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};
