'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type VideoDevice = MediaDeviceInfo & { kind: 'videoinput' };

const STREAM_TO_BACKEND = false; // set to true when your backend /v1/observe is ready

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleTimerRef = useRef<number | null>(null);

  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

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
    if (sampleTimerRef.current) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
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

    // For demo: open captured image in a new tab
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');

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

      <div className="relative aspect-video w-full mx-auto overflow-hidden rounded-xl bg-black max-h-[calc(100vh-16rem)]">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
          playsInline
          muted
          autoPlay
        />
        {/* Controls overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-between bg-black/30">
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
        Tip: On iOS Safari, camera requires HTTPS or localhost, and must be started by a user action.
      </p>
    </div>
  );
}
