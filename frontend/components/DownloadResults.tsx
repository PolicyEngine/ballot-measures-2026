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
      className="px-4 py-2 rounded-lg text-sm font-medium border border-primary-500 text-primary-700 bg-white hover:bg-primary-50"
    >
      {label}
    </button>
  );
}
