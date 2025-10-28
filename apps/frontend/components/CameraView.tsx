'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import useAudioRecorder from '../hooks/useAudioRecorder';
import PlanChecklist from './PlanChecklist';
import TranscriptOverlay from './TranscriptOverlay';
import { DotsScaleIcon } from '@/components/ui/icons/svg-spinners-3-dots-scale';

const CAPTURE_PREVIEW_DURATION_MS = 3000;

export default function CameraView({ settings }: { settings: { sourceLanguage: string; targetLanguage: string; location: string; actions: string[] } }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const capturePreviewTimerRef = useRef<number | null>(null);
  const capturePreviewUrlRef = useRef<string | null>(null);

  const [running, setRunning] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);

  const [transcripts, setTranscripts] = useState<{ speaker: string; text: string }[]>([]);
  const { isRecording, start: startRecording, stop: stopRecording, error: audioError } = useAudioRecorder();
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [llmStreaming, setLlmStreaming] = useState<string>("");
  const [planObjects, setPlanObjects] = useState<{ source_name: string; target_name: string; action: string }[] | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState<boolean>(false);
  const [showCapturePrompt, setShowCapturePrompt] = useState<boolean>(true);


  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000',
    []
  );
  const wsUrl = useMemo(() => backendUrl.replace(/^http/, 'ws'), [backendUrl]);

  const openWs = useCallback(() => {
    try {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
      const ws = new WebSocket(`${wsUrl}/v1/ws`);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'control', payload: { action: 'start' } }));
      };
      ws.onmessage = (evt) => {
        try {
          const msg = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
          if (!msg || !msg.type) return;
          switch (msg.type) {
            case 'status':
              // no-op for now
              break;
            case 'asr_final': {
              const text: string = msg.payload?.text ?? '';
              if (text) {
                setTranscripts(prev => [...prev, { speaker: 'User', text }]);
                ws.send(JSON.stringify({ type: 'text', payload: { text } }));
              }
              break;
            }
            case 'llm_token': {
              const token: string = msg.payload?.token ?? '';
              if (token) setLlmStreaming(prev => prev + token);
              break;
            }
            case 'llm_final': {
              const text: string = msg.payload?.text ?? '';
              if (text) setTranscripts(prev => [...prev, { speaker: 'LLM', text }]);
              setLlmStreaming("");
              break;
            }
            case 'plan': {
              const objects = msg.payload?.objects ?? null;
              if (Array.isArray(objects)) setPlanObjects(objects);
              const sceneMsg: string | null = msg.payload?.scene_message ?? null;
              if (typeof sceneMsg === 'string') {
                setTranscripts(prev => [...prev, { speaker: 'LLM', text: sceneMsg }]);
              }
              setIsPlanLoading(false);
              setShowCapturePrompt(false);
              break;
            }
            default:
              break;
          }
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        wsRef.current = null;
      };
      wsRef.current = ws;
    } catch {}
  }, [wsUrl]);

  const closeWs = useCallback(() => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    } catch {}
  }, []);

  // Start the camera with constraints
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      // Stop any existing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        } as MediaTrackConstraints,
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Bind the stream
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setRunning(true);
      openWs();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start camera');
      setRunning(false);
    }
  }, [facing]);

  const stopCamera = useCallback(() => {
    if (capturePreviewTimerRef.current) {
      window.clearTimeout(capturePreviewTimerRef.current);
      capturePreviewTimerRef.current = null;
    }
    if (capturePreviewUrlRef.current) {
      URL.revokeObjectURL(capturePreviewUrlRef.current);
      capturePreviewUrlRef.current = null;
    }
    setCapturePreviewUrl(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setRunning(false);
    closeWs();
  }, []);

  // Capture still frame (returns a Blob and also opens a preview tab)
  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror front camera for a selfie-like preview
    if (facing === 'user') {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.8)
    );
    if (!blob) return;

    if (capturePreviewUrlRef.current) {
      URL.revokeObjectURL(capturePreviewUrlRef.current);
      capturePreviewUrlRef.current = null;
    }
    const url = URL.createObjectURL(blob);
    capturePreviewUrlRef.current = url;
    setCapturePreviewUrl(url);
    if (capturePreviewTimerRef.current) {
      window.clearTimeout(capturePreviewTimerRef.current);
    }
    capturePreviewTimerRef.current = window.setTimeout(() => {
      if (capturePreviewUrlRef.current) {
        URL.revokeObjectURL(capturePreviewUrlRef.current);
        capturePreviewUrlRef.current = null;
      }
      setCapturePreviewUrl(null);
      capturePreviewTimerRef.current = null;
    }, CAPTURE_PREVIEW_DURATION_MS);

    // Send via WebSocket if connected
    try {
      const canvas = canvasRef.current;
      if (wsRef.current && canvas) {
        setIsPlanLoading(true);
        setPlanObjects(null);
        setPlanMessage(null);
        setShowCapturePrompt(false);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        wsRef.current.send(JSON.stringify({
          type: 'image',
          payload: {
            data_url: dataUrl,
            mime: 'image/jpeg',
            target_language: settings.targetLanguage,
            source_language: settings.sourceLanguage,
            location: settings.location,
            actions: settings.actions
          }
        }));
      }
    } catch {}
  }, [backendUrl, facing]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    return () => {
      if (capturePreviewTimerRef.current) {
        window.clearTimeout(capturePreviewTimerRef.current);
        capturePreviewTimerRef.current = null;
      }
      if (capturePreviewUrlRef.current) {
        URL.revokeObjectURL(capturePreviewUrlRef.current);
        capturePreviewUrlRef.current = null;
      }
    };
  }, []);

  // Checklist state
  const [completed, setCompleted] = useState<boolean[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  useEffect(() => {
    if (planObjects && planObjects.length) {
      setCompleted(new Array(planObjects.length).fill(false));
      setCurrentIndex(0);
    } else {
      setCompleted([]);
      setCurrentIndex(0);
    }
  }, [planObjects]);

  const toggleItem = (i: number) => {
    setCompleted(prev => {
      const next = [...prev];
      next[i] = !next[i];
      // advance current index to next incomplete
      if (next[i] && i === currentIndex) {
        const nextIdx = next.findIndex((v, idx) => !v && idx > i);
        setCurrentIndex(nextIdx === -1 ? i : nextIdx);
      }
      return next;
    });
  };

  const toggleRecording = useCallback(async () => {
    if (!running) return;
    if (isRecording) {
      const blob = await stopRecording();
      if (blob) setAudioBlob(blob);
    } else {
      setAudioBlob(null);
      await startRecording();
    }
  }, [running, isRecording, startRecording, stopRecording]);

  const sendAudio = useCallback(async () => {
    if (!audioBlob) return;
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const buf = await audioBlob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        wsRef.current.send(JSON.stringify({ type: 'audio_chunk', payload: { data_b64: b64, mime: audioBlob.type || 'audio/webm' } }));
        wsRef.current.send(JSON.stringify({ type: 'audio_end' }));
        setAudioBlob(null);
      } else {
        const form = new FormData();
        form.append('file', audioBlob, 'audio.webm');
        const res = await fetch(`${backendUrl}/v1/transcribe`, { method: 'POST', body: form });
        if (res.ok) {
          const { text } = await res.json();
          setTranscripts(prev => [...prev, { speaker: 'User', text }]);
          setAudioBlob(null);
        }
      }
    } catch (_) {}
  }, [audioBlob, backendUrl]);

  return (
    <div className="rounded-2xl border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Camera</h2>
        {!running ? (
          <Button onClick={startCamera} variant="outline" className="text-sm">Start</Button>
        ) : (
          <Button onClick={stopCamera} variant="outline" className="text-sm">Stop</Button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
      {audioError && (
        <div className="text-sm text-red-600">{audioError}</div>
      )}

      <div className="relative aspect-video w-full mx-auto overflow-hidden rounded-xl bg-black max-h-[calc(100vh-16rem)]">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
          playsInline
          muted
          autoPlay
        />
        {showCapturePrompt && !isPlanLoading && (
          <div className="pointer-events-none absolute inset-x-0 top-3 p-3 flex items-center justify-center">
            <div className="text-white text-sm text-center drop-shadow">
              Please capture the scene.
            </div>
          </div>
        )}
        {isRecording && (
          <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-white/40 bg-black/50 px-3 py-1.5 text-white backdrop-blur">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs">Recording</span>
            </div>
          </div>
        )}
        
        {/* Plan overlay left */}
        {planObjects && planObjects.length > 0 && (
          <div className="absolute left-3 top-3 z-10 w-[70%] max-w-xs pointer-events-auto">
            <PlanChecklist
              items={planObjects}
              currentIndex={currentIndex}
              completed={completed}
              onToggle={toggleItem}
              variant="overlay"
            />
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={captureFrame} variant="default" className="text-xs" disabled={!running} title="Capture">Capture</Button>
          {planObjects && planObjects.length > 0 && (
            <>
              <Button onClick={toggleRecording} variant={isRecording ? 'destructive' : 'outline'} className="text-xs" disabled={!running} title={isRecording ? 'Stop recording' : 'Record audio'}>
                {isRecording ? 'Stop' : 'Record'}
              </Button>
              <Button onClick={sendAudio} variant="outline" className="text-xs" disabled={!audioBlob} title="Send">
                Send
              </Button>
            </>
          )}
          {planObjects && (
            <Button onClick={() => { setPlanObjects(null); setPlanMessage(null); setShowCapturePrompt(true); }} variant="outline" className="text-xs" title="Retake">Retake</Button>
          )}
        </div>
        {isPlanLoading && (
          <div className="pointer-events-none absolute inset-x-0 top-3 p-3 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full border border-white/40 bg-black/50 px-3 py-1.5 text-white backdrop-blur text-xs">
              <DotsScaleIcon size={14} className="text-white" />
              <span>Analyzing Scene</span>
            </div>
          </div>
        )}
        {capturePreviewUrl && (
          <button
            type="button"
            onClick={() => {
              if (!capturePreviewUrl) return;
              window.open(capturePreviewUrl, '_blank');
            }}
            className="absolute bottom-4 left-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border-2 border-white/80 bg-black/60 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/60"
            title="View last capture"
          >
            <img
              src={capturePreviewUrl}
              alt="Capture preview"
              className="h-full w-full object-cover"
            />
          </button>
        )}
        {(transcripts.length > 0 || !!llmStreaming) && (
          <TranscriptOverlay transcripts={transcripts} streamingText={llmStreaming} className="absolute right-4 top-4" />
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <p className="text-xs text-gray-500">
      </p>
      
    </div>
  );
}
