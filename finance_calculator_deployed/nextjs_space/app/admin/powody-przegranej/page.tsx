import { requireSuperuser } from '@/lib/access/context';
import LostReasonsAdmin, { LostReasonsForbidden } from '@/components/lostReasons/LostReasonsAdmin';

// Powody przegranej - superuser only. The middleware already redirects tokens without the `su`
// hint; this re-checks users.is_superuser fresh, like /admin/cennik. The /api/admin/lost-reasons
// routes enforce the same rule on their own.
export default async function LostReasonsPage() {
  const auth = await requireSuperuser();
  if ('error' in auth) return <LostReasonsForbidden />;
  return <LostReasonsAdmin />;
}
