'use client';

import { FileAudio, Image as ImageIcon, Mic, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { IncidentAttachment, IncidentDraft } from '../types';

const fileToAttachment = (file: File, kind: 'photo' | 'audio') =>
  new Promise<IncidentAttachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        kind,
        name: file.name,
        mimeType: file.type,
        dataUrl: String(reader.result),
      });
    reader.readAsDataURL(file);
  });

export function AdditionalInfoForm({
  draft,
  onChange,
  onSend,
  onSkip,
  acceptedNotice,
  sending,
  error,
}: {
  draft: IncidentDraft;
  onChange: (draft: IncidentDraft) => void;
  onSend: () => void;
  onSkip: () => void;
  acceptedNotice?: string;
  sending: boolean;
  error: string;
}) {
  const [mediaError, setMediaError] = useState('');
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const chooseFile = async (file: File | undefined, kind: 'photo' | 'audio') => {
    if (!file) return;
    const max = kind === 'photo' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      setMediaError(`${kind === 'photo' ? 'Photo' : 'Audio'} must be ${kind === 'photo' ? '5' : '10'} MB or smaller.`);
      return;
    }
    try {
      const attachment = await fileToAttachment(file, kind);
      onChange({ ...draft, [kind === 'photo' ? 'photo' : 'audio']: attachment, dirty: true });
      setMediaError('');
    } catch (cause) {
      setMediaError(cause instanceof Error ? cause.message : 'The selected file could not be read.');
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMediaError('Voice recording is not supported here. You can still type or attach an audio file.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size <= 10 * 1024 * 1024) {
          const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type });
          await chooseFile(file, 'audio');
        } else {
          setMediaError('Recording is larger than 10 MB. Record a shorter message.');
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
      setMediaError('');
    } catch {
      setMediaError('Microphone access was refused. You can still type or attach an audio file.');
    }
  };

  const stopRecording = () => recorderRef.current?.state === 'recording' && recorderRef.current.stop();

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="space-y-5">
      {acceptedNotice && <div className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm font-bold text-emerald-900" role="status">{acceptedNotice}</div>}
      <div>
        <label htmlFor="what-happened" className="font-bold text-slate-950">What happened?</label>
        <textarea
          id="what-happened"
          rows={4}
          value={draft.happened}
          onChange={(event) => onChange({ ...draft, happened: event.target.value, dirty: true })}
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-base text-slate-950 outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100"
          placeholder="Describe what you can see or hear"
        />
      </div>
      <div>
        <label htmlFor="landmark" className="font-bold text-slate-950">Landmark or access instruction</label>
        <input
          id="landmark"
          value={draft.landmark}
          onChange={(event) => onChange({ ...draft, landmark: event.target.value, dirty: true })}
          className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-950 outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100"
          placeholder="Building, floor, gate or nearby landmark"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.10)]">
          <div className="flex items-center gap-2 font-bold text-slate-950"><ImageIcon className="h-5 w-5 text-[#003172]" /> Photo</div>
          <p className="mt-1 text-sm text-slate-600">JPG, PNG or WebP · maximum 5 MB</p>
          {draft.photo ? (
            <div className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.photo.dataUrl} alt="Selected attachment preview" className="h-28 w-full rounded-lg object-cover" />
              <button type="button" onClick={() => onChange({ ...draft, photo: null, dirty: true })} className="mt-2 flex min-h-11 items-center gap-2 font-bold text-red-700"><Trash2 className="h-4 w-4" /> Remove photo</button>
            </div>
          ) : (
            <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-50 font-bold text-[#003172] shadow-inner focus-within:ring-4 focus-within:ring-blue-100">
              <Upload className="h-4 w-4" /> Choose photo
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0], 'photo')} />
            </label>
          )}
        </div>
        <div className="rounded-xl bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.10)]">
          <div className="flex items-center gap-2 font-bold text-slate-950"><FileAudio className="h-5 w-5 text-[#003172]" /> Voice or audio</div>
          <p className="mt-1 text-sm text-slate-600">Audio file or recording · maximum 10 MB</p>
          {draft.audio ? (
            <div className="mt-3">
              <audio controls src={draft.audio.dataUrl} className="w-full" aria-label="Audio attachment preview" />
              <button type="button" onClick={() => onChange({ ...draft, audio: null, dirty: true })} className="mt-2 flex min-h-11 items-center gap-2 font-bold text-red-700"><Trash2 className="h-4 w-4" /> Remove audio</button>
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              <Button type="button" variant={recording ? 'emergency' : 'outline'} onClick={recording ? stopRecording : startRecording}>
                {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{recording ? 'Stop recording' : 'Record voice note'}
              </Button>
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-50 text-sm font-bold text-[#003172] shadow-inner focus-within:ring-4 focus-within:ring-blue-100">
                <Upload className="h-4 w-4" /> Attach audio file
                <input type="file" accept="audio/*" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0], 'audio')} />
              </label>
            </div>
          )}
        </div>
      </div>
      {(mediaError || error) && <p className="text-sm font-semibold text-red-700" role="alert">{mediaError || error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="submit" className="min-h-12" disabled={sending || (!draft.happened.trim() && !draft.landmark.trim() && !draft.photo && !draft.audio)}>
          {sending ? 'Sending information…' : 'Send additional information'}
        </Button>
        <Button type="button" variant="outline" className="min-h-12" onClick={onSkip}>Skip for now</Button>
      </div>
      {draft.dirty && <p className="text-sm font-semibold text-amber-800">Draft saved locally. It is not sent until you select “Send additional information”.</p>}
    </form>
  );
}
