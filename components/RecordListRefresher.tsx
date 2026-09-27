'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Re-fetches /records from the server whenever the user lands on it.
 *
 * The create (and delete) screens are intercepting routes layered over /records,
 * so the list component stays mounted the whole time — a mount-triggered refresh
 * would run only on first load and never when the modal closes. Watching the URL
 * covers every arrival path:
 *   - back-navigation from the create modal (URL returns to /records)
 *   - back-navigation from a detail view
 *   - forward navigation (router.back() restoring a cached /records payload)
 *   - a fresh page load
 * Without this the list can replay a stale client-router-cache payload and the
 * newly created record stays invisible until a manual refresh — see PRD 5.2.
 */
export function RecordListRefresher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/records') {
      router.refresh();
    }
  }, [pathname, router]);

  return null;
}