import { Protected } from '@/components/protected';
import { SupplyDesk } from '@/components/supply/supply-desk';

export default function SupplyPage() {
  return <Protected><SupplyDesk /></Protected>;
}
