import Link from 'next/link';

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const ArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7 7m-7-7l7-7" />
  </svg>
);

/** "← 2026 ballot measures › Colorado", after the state legislative tracker's breadcrumb. */
export default function Breadcrumb({ stateName }: { stateName: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href="/"
            aria-label="Back to all 2026 ballot measures"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-primary-600 hover:border-primary-200 hover:bg-primary-50"
          >
            <ArrowLeft />
          </Link>
        </li>
        <li>
          <Link href="/" className="font-medium text-primary-600 hover:underline">
            2026 ballot measures
          </Link>
        </li>
        <li aria-hidden="true" className="text-gray-400">
          <ChevronRight />
        </li>
        <li aria-current="page" className="text-gray-600">
          {stateName}
        </li>
      </ol>
    </nav>
  );
}
