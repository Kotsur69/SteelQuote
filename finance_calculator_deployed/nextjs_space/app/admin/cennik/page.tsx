import { requireSuperuser } from '@/lib/access/context';
import PriceBookPanel, { PriceBookForbidden } from '@/components/priceBook/PriceBookPanel';

// Cennik dopłat - superuser only. The middleware already redirects tokens without the `su`
// hint; this re-checks users.is_superuser fresh, like every /api/admin route does. PUT
// /api/price-book enforces the same rule on its own.
export default async function PriceBookPage() {
  const auth = await requireSuperuser();
  if ('error' in auth) return <PriceBookForbidden />;
  return <PriceBookPanel />;
}
