'use client';

import { useResultsCsv } from '@/lib/measures';
import { measureCsv, saveText } from '@/lib/download';

interface Props {
  slug: string;
  /** Results file to download, e.g. metrics.csv. */
  file: string;
  label: string;
}

/** Saves one measure's rows (every scored year) from a results CSV. */
export default function DownloadResults({ slug, file, label }: Props) {
  const { data } = useResultsCsv(file);
  const text = measureCsv(data, slug);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={() => saveText(`${slug}-${file}`, text)}
      className="px-4 py-2 rounded-lg font-semibold text-white bg-teal-500 hover:bg-teal-600 active:bg-teal-700 transition-colors shadow-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
    >
      {label}
    </button>
  );
}
