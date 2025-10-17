'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAudioRecorder from '../hooks/useAudioRecorder';

type VideoDevice = MediaDeviceInfo & { kind: 'videoinput' };

const STREAM_TO_BACKEND = false; // set to true when your backend /v1/observe is ready
const CAPTURE_PREVIEW_DURATION_MS = 3000;

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleTimerRef = useRef<number | null>(null);
  const capturePreviewTimerRef = useRef<number | null>(null);
  const capturePreviewUrlRef = useRef<string | null>(null);

  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);

  const { isRecording, start: startRecording, stop: stopRecording, error: audioError } = useAudioRecorder();

  const mockTranscripts = useMemo(
    () => [
      { speaker: 'LLM', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      { speaker: 'User', text: 'Mauris non tempor quam, et lacinia sapien.' },
      { speaker: 'LLM', text: 'Fusce vel dui. Vivamus aliquet elit ac nisl.' },
      { speaker: 'User', text: 'Pellentesque dapibus hendrerit tortor.' },
    ],
    []
  );

  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000',
    []
  );

  // Enumerate video devices (after permission is granted at least once)
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter(d => d.kind === 'videoinput') as VideoDevice[];
      setDevices(cams);
      // Pick a back-facing device if available
      if (!activeDeviceId && cams.length) {
        const env = cams.find(d => /back|rear|environment/i.test(d.label));
        setActiveDeviceId(env?.deviceId ?? cams[0].deviceId);
      }
    } catch (e: any) {
      // Some browsers require a prior getUserMedia call before labels are exposed
    }
  }, [activeDeviceId]);

  // Start the camera with constraints
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      // Stop any existing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const useDevice = activeDeviceId ? { deviceId: { exact: activeDeviceId } } : {};
      const constraints: MediaStreamConstraints = {
        video: {
          ...(useDevice as any),
          facingMode: useDevice ? undefined : { ideal: facing }, // use facingMode only if no explicit device
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          // advanced: [{ torch: torchOn }] // torch via constraints is very device-specific
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
      void refreshDevices(); // update labels after permission

      // Torch detection (Android only, limited support)
      try {
        const [track] = stream.getVideoTracks();
        const caps: any = track.getCapabilities?.() ?? {};
        setTorchAvailable(Boolean(caps.torch));
      } catch {
        setTorchAvailable(false);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start camera');
      setRunning(false);
    }
  }, [activeDeviceId, facing, torchOn, refreshDevices]);

  const stopCamera = useCallback(() => {
    if (isRecording) {
      void stopRecording();
    }
    if (sampleTimerRef.current) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
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
    setTorchOn(false);
  }, []);

  // Switch front/back
  const toggleFacing = useCallback(() => {
    setFacing(prev => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // Apply torch if supported (Android Chrome on some devices)
  const toggleTorch = useCallback(async () => {
    if (!torchAvailable || !streamRef.current) return;
    try {
      const [track] = streamRef.current.getVideoTracks();
      // @ts-ignore – advanced constraints may not be fully typed
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(v => !v);
    } catch (e: any) {
      setError('Torch not supported on this device/browser.');
    }
  }, [torchAvailable, torchOn]);

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

    // Optionally POST to backend
    if (STREAM_TO_BACKEND) {
      const form = new FormData();
      form.append('file', blob, 'frame.jpg');
      try {
        await fetch(`${backendUrl}/v1/observe`, { method: 'POST', body: form });
      } catch (e) {
        console.warn('Upload failed:', e);
      }
    }
  }, [backendUrl, facing]);

  const toggleRecording = useCallback(async () => {
    if (!running) return;
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [running, isRecording, startRecording, stopRecording]);

  // Sample frames at a given FPS and send to backend (disabled by default)
  const startSampling = useCallback((fps = 1) => {
    if (!STREAM_TO_BACKEND) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const periodMs = Math.max(200, Math.floor(1000 / fps));
    if (sampleTimerRef.current) window.clearInterval(sampleTimerRef.current);

    sampleTimerRef.current = window.setInterval(async () => {
      if (!running) return;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.7)
      );
      if (!blob) return;

      const form = new FormData();
      form.append('file', blob, 'frame.jpg');
      try {
        await fetch(`${backendUrl}/v1/observe`, { method: 'POST', body: form });
      } catch (e) {
        // Network errors are expected during dev; swallow for now
      }
    }, periodMs);
  }, [backendUrl, facing, running]);

  // React to device/facing changes
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (running) {
      // If you need continuous sampling, enable this and set fps
      // startSampling(1); // e.g., 1 FPS
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // If device list changes, (re)start to apply
  useEffect(() => {
    if (running) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeviceId, facing]);

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

  return (
    <div className="rounded-2xl border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Camera</h2>
        {!running ? (
          <button
            onClick={startCamera}
            className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
          >
            Start
          </button>
        ) : (
          <button
            onClick={stopCamera}
            className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
          >
            Stop
          </button>
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
        {isRecording && (
          <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-white/40 bg-black/50 px-3 py-1.5 text-white backdrop-blur">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs">Recording…</span>
              <div className="flex items-end gap-[2px]" style={{ height: '28px' }}>
                <span className="eq-bar" style={{ ['--d' as any]: 0 }} />
                <span className="eq-bar" style={{ ['--d' as any]: 1 }} />
                <span className="eq-bar" style={{ ['--d' as any]: 2 }} />
                <span className="eq-bar" style={{ ['--d' as any]: 3 }} />
                <span className="eq-bar" style={{ ['--d' as any]: 4 }} />
              </div>
            </div>
          </div>
        )}
        {/* Controls overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex flex-wrap items-center justify-center gap-2 bg-black/30">
          <button
            onClick={toggleFacing}
            className="px-3 py-1.5 rounded-xl border border-white/60 text-white text-xs"
            disabled={!running}
            title="Switch camera"
          >
            Switch
          </button>
          <button
            onClick={captureFrame}
            className="px-3 py-1.5 rounded-full border-2 border-white/80 bg-white/80 text-xs"
            disabled={!running}
            title="Capture"
          >
            Capture
          </button>
          <button
            onClick={toggleTorch}
            className="px-3 py-1.5 rounded-xl border border-white/60 text-white text-xs disabled:opacity-40"
            disabled={!running || !torchAvailable}
            title="Toggle torch"
          >
            {torchOn ? 'Torch On' : 'Torch Off'}
          </button>
          <button
            onClick={toggleRecording}
            className={`px-3 py-1.5 rounded-xl border text-xs disabled:opacity-40 ${
              isRecording ? 'border-red-500 bg-red-600 text-white' : 'border-white/60 text-white'
            }`}
            disabled={!running}
            title={isRecording ? 'Stop recording' : 'Record audio'}
          >
            {isRecording ? 'Stop' : 'Record Audio'}
          </button>
          <button
            onClick={() => {}}
            className="px-3 py-1.5 rounded-xl border border-white/60 text-white text-xs disabled:opacity-40"
            disabled={!running}
            title="Send"
          >
            Send
          </button>
        </div>
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
        <div className="pointer-events-none absolute right-4 top-4 flex max-w-xs flex-col gap-2 rounded-xl border border-white/30 bg-black/40 p-3 text-white backdrop-blur-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Live Transcript
          </h3>
          <div className="space-y-2 text-xs leading-snug">
            {mockTranscripts.map((entry, index) => (
              <div key={index} className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-white/60">
                  {entry.speaker}
                </span>
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device picker (optional) */}
      {devices.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Camera:</label>
          <select
            value={activeDeviceId ?? ''}
            onChange={(e) => setActiveDeviceId(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-xl border w-full"
            disabled={running && !activeDeviceId}
          >
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${d.deviceId.slice(0, 5)}…`}
              </option>
            ))}
          </select>
          <button
            onClick={refreshDevices}
            className="px-3 py-1.5 rounded-xl border text-sm"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Hidden canvas for frame capture/sampling */}
      <canvas ref={canvasRef} className="hidden" />
      <p className="text-xs text-gray-500">
      </p>
      <style jsx>{`
        .eq-bar {
          display: inline-block;
          width: 3px;
          background: rgba(255,255,255,0.9);
          border-radius: 2px;
          height: 8px;
          margin-top: auto;
          transform-origin: bottom;
          animation: eq-bounce 1s ease-in-out infinite;
          animation-delay: calc(var(--d) * 0.12s);
        }
        @keyframes eq-bounce {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
