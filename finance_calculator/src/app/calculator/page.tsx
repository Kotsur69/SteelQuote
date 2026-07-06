import { Suspense } from 'react';
import Calculator from '@/components/Calculator';

function CalculatorLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="text-[#7b88aa] font-mono text-sm">Loading calculator...</div>
    </div>
  );
}

export default function CalculatorPage() {
  return (
    <Suspense fallback={<CalculatorLoading />}>
      <Calculator />
    </Suspense>
  );
}
