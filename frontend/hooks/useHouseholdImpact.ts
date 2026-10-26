import { useQuery } from '@tanstack/react-query';
import { calculateHousehold, type HouseholdRequest, type HouseholdResponse } from '@/lib/householdApi';

/**
 * Live household calculation. No automatic retries: a cold start can take
 * 1-2 minutes, so a silent retry would double the wait, and 422s are
 * deterministic.
 */
export function useHouseholdImpact(request: HouseholdRequest | null, enabled: boolean) {
  return useQuery<HouseholdResponse>({
    queryKey: ['householdImpact', request],
    queryFn: ({ signal }) => calculateHousehold(request as HouseholdRequest, { signal }),
    enabled: enabled && request !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
