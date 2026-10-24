import { Protected } from '@/components/protected';
import { MoneyDesk } from '@/components/money/money-desk';

export default function MoneyPage() {
  return <Protected><MoneyDesk /></Protected>;
}
