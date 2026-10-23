'use client';

import { DATA_DIR, USING_PLACEHOLDER_DATA } from '@/lib/config';
import { useManifest } from '@/lib/measures';

/**
 * Visible warning when the dashboard reads synthetic fixtures
 * (NEXT_PUBLIC_DATA_DIR) or a results manifest marked synthetic.
 */
export default function PlaceholderBanner() {
  const { data: manifest } = useManifest();
  if (!USING_PLACEHOLDER_DATA && !manifest?.synthetic) return null;
  return (
    <div
      role="alert"
      className="bg-gray-900 text-white text-sm px-4 py-2 text-center"
      data-testid="placeholder-banner"
    >
      <strong className="font-semibold">Placeholder data.</strong> The figures on this preview are
      synthetic ({DATA_DIR}/) and are not PolicyEngine estimates.
    </div>
  );
}
