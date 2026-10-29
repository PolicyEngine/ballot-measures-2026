import Breadcrumb from './Breadcrumb';
import type { LinkedTool } from '@/content/linkedTools';
import { formatLongDate } from '@/lib/format';
import { ELECTION_DATE } from '@/lib/registry';

/**
 * A measure PolicyEngine covers with a separate calculator: the measure
 * pages' white title block, one intro line, then the calculator embedded at
 * full width. No tabs.
 */
export default function LinkedToolPage({ tool }: { tool: LinkedTool }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 pt-6 pb-5">
          <Breadcrumb stateName={tool.stateName} />
          <h1 className="text-3xl font-bold text-gray-900">
            {tool.stateName} {tool.designation}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {tool.shortTitle} · {formatLongDate(ELECTION_DATE)}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="text-gray-700">{tool.intro}</p>
          <a
            href={tool.calculatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary-700 hover:underline"
          >
            Open the calculator in a new tab
            <span className="sr-only"> (opens in a new tab)</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <iframe
            src={tool.embedUrl}
            title={tool.embedTitle}
            className="block w-full h-[calc(100vh-200px)] min-h-[900px] border-0"
          />
        </div>
      </div>
    </main>
  );
}
