import '@testing-library/jest-dom';
import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

// Mock window.matchMedia for responsive component tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// The app router is not mounted in unit tests.
vi.mock('next/navigation', async () => {
  const { routerMock } = await import('./routerMock');
  return {
    useRouter: () => routerMock,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
      throw new Error('notFound');
    },
  };
});

// jsdom has no layout, so ResponsiveContainer would measure 0 x 0 and
// Recharts would draw nothing. Give every chart a fixed size instead, so
// tests can assert on rendered axes and labels.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children, height }: { children: ReactNode; height?: number }) =>
      createElement(
        'div',
        { 'data-testid': 'responsive-container' },
        isValidElement(children)
          ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
              width: 800,
              height: typeof height === 'number' ? height : 400,
            })
          : children,
      ),
  };
});
