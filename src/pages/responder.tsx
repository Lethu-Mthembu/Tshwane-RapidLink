import { ExternalLink, MessageSquareText, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export default function ResponderLandingPage() {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-[0_14px_38px_rgba(15,23,42,0.08)] sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#003172]"><Smartphone className="h-7 w-7" /></span>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-[#003172]">Responder access</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Review and manage your emergency requests.</p>
          <Button asChild className="mt-6 min-h-12 w-full sm:w-auto"><Link to="/messages"><MessageSquareText className="h-4 w-4" /> Open requests <ExternalLink className="h-4 w-4" /></Link></Button>
        </section>
      </div>
    </main>
  );
}
