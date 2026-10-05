import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(window.localStorage.getItem('rapidlink-install-dismissed') === 'yes');
    const capture = (value: Event) => { value.preventDefault(); setEvent(value as InstallEvent); setDismissed(false); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);
  if (!event || dismissed) return null;
  return <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#003172] p-4 text-white shadow-2xl" role="status"><Download className="h-6 w-6 shrink-0" /><div className="min-w-0 flex-1"><p className="font-extrabold">Install RapidLink</p><p className="text-xs text-blue-100">Open quickly and keep RapidLink available offline.</p></div><button type="button" onClick={async () => { await event.prompt(); const choice = await event.userChoice; if (choice.outcome === 'accepted') setEvent(null); }} className="rounded-lg bg-white px-3 py-2 text-sm font-extrabold text-[#003172]">Install</button><button type="button" aria-label="Dismiss install prompt" onClick={() => { window.localStorage.setItem('rapidlink-install-dismissed', 'yes'); setDismissed(true); }} className="grid h-9 w-9 place-items-center"><X className="h-4 w-4" /></button></div>;
}
