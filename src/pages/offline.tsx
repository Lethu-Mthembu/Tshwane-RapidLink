import { CloudOff } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  return <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-slate-50 px-4"><div className="max-w-md text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-900"><CloudOff className="h-8 w-8" /></span><h1 className="mt-5 text-3xl font-black text-[#003172]">Connection unavailable</h1><p className="mt-3 leading-7 text-slate-600">Check your network connection. Pending updates will be sent automatically when connectivity returns.</p><Button asChild className="mt-6"><Link to="/">Return to RapidLink</Link></Button></div></main>;
}
