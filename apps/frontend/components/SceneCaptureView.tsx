'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DotsScaleIcon } from '@/components/ui/icons/svg-spinners-3-dots-scale';
import OverlayCard from '@/components/OverlayCard';

const CAPTURE_PREVIEW_DURATION_MS = 3000;

interface SceneObject {
  source_name: string;
  target_name: string;
}

interface VocabItem {
  source_name: string;
  target_name: string;
}

interface TeacherScene {
  id: string;
  name: string;
  description: string;
  vocab: VocabItem[];
}


interface SceneCaptureViewProps {
  settings: {
    sourceLanguage: string;
    targetLanguage: string;
    location: string;
    actions: string[];
  };
  email?: string;
  mode?: 'embedded' | 'fullscreen';
}

export default function SceneCaptureView({ settings, email, mode = 'embedded' }: SceneCaptureViewProps) {
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
  const [isExtracting, setIsExtracting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Scene selection state
  const [teacherScenes, setTeacherScenes] = useState<TeacherScene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [loadingScenes, setLoadingScenes] = useState(true);

  // Scene capture state
  const [capturedObjects, setCapturedObjects] = useState<SceneObject[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000',
    []
  );
  const wsUrl = useMemo(() => backendUrl.replace(/^http/, 'ws'), [backendUrl]);

  // Get selected scene details
  const selectedScene = useMemo(
    () => teacherScenes.find(s => s.id === selectedSceneId),
    [teacherScenes, selectedSceneId]
  );

  // Fetch teacher scenes on mount
  useEffect(() => {
    const fetchScenes = async () => {
      if (!email) {
        setLoadingScenes(false);
        return;
      }
      try {
        setLoadingScenes(true);
        const res = await fetch(`${backendUrl}/v1/student/scenes?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json();
          setTeacherScenes(data || []);
        }
      } catch (e) {
        console.error('Failed to fetch scenes:', e);
      } finally {
        setLoadingScenes(false);
      }
    };
    fetchScenes();
  }, [backendUrl, email]);

  const openWs = useCallback(() => {
    try {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
      const ws = new WebSocket(`${wsUrl}/v1/ws/scene-capture`);
      ws.onopen = () => {
        // Send initial config with scene_id and email
        ws.send(JSON.stringify({
          type: 'config',
          payload: {
            scene_id: selectedSceneId,
            scene_name: selectedScene?.name || 'default',
            target_language: settings.targetLanguage,
            source_language: settings.sourceLanguage,
            location: settings.location,
            email: email,
          }
        }));
      };
      ws.onmessage = (evt) => {
        try {
          const msg = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
          if (!msg || !msg.type) return;
          switch (msg.type) {
            case 'status':
              // Handle status messages
              break;
            case 'vocab_extracted': {
              const allObjects: SceneObject[] = msg.payload?.all_objects ?? [];
              setCapturedObjects(allObjects);
              setIsExtracting(false);
              break;
            }
            case 'session_complete': {
              const objectsSaved = msg.payload?.objects_saved ?? 0;
              setSavedCount(objectsSaved);
              setSessionComplete(true);
              break;
            }
            default:
              break;
          }
        } catch { }
      };
      ws.onerror = () => { };
      ws.onclose = () => {
        wsRef.current = null;
      };
      wsRef.current = ws;
    } catch { }
  }, [wsUrl, selectedSceneId, selectedScene, settings, email]);

  const closeWs = useCallback(() => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    } catch { }
  }, []);

  // Start the camera with constraints
  const startCamera = useCallback(async () => {
    if (!selectedSceneId) {
      setError('Please select a scene first');
      return;
    }

    setError(null);
    setSessionComplete(false);
    setSavedCount(0);
    setCapturedObjects([]);
    try {
      // Stop any existing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const video = videoRef.current;
      if (!video) {
        throw new Error('Video element not available');
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

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          reject(new Error('Video metadata loading timeout'));
        }, 5000);

        const onLoadedMetadata = () => {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = (err: Event) => {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          reject(new Error('Video element failed to load'));
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onError);

        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          resolve();
        }
      });

      try {
        await video.play();
      } catch (playError: any) {
        console.warn('Autoplay failed:', playError);
      }

      setRunning(true);
      openWs();
    } catch (e: any) {
      console.error('Camera start error:', e);
      let errorMessage = 'Failed to start camera';
      if (e?.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied.';
      } else if (e?.name === 'NotFoundError') {
        errorMessage = 'No camera found.';
      } else if (e?.message) {
        errorMessage = e.message;
      }
      setError(errorMessage);
      setRunning(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  }, [facing, openWs, selectedSceneId]);

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
  }, [closeWs]);

  // Capture frame and extract vocab
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

    // Preview
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

    // Send via WebSocket
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setIsExtracting(true);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        wsRef.current.send(JSON.stringify({
          type: 'image',
          payload: {
            data_url: dataUrl,
            target_language: settings.targetLanguage,
            source_language: settings.sourceLanguage,
            location: settings.location,
          }
        }));
      }
    } catch { }
  }, [facing, settings]);

  const endSession = useCallback(() => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'control',
          payload: {
            action: 'end_session',
          }
        }));
      }
    } catch { }
  }, []);

  const startNewSession = useCallback(() => {
    setSessionComplete(false);
    setSavedCount(0);
    setCapturedObjects([]);
    setSelectedSceneId('');
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
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

  // Ensure video plays when stream is set
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;

    const handleLoadedMetadata = () => {
      video.play().catch(() => { });
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.play().catch(() => { });
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [running]);

  // Session complete view
  if (sessionComplete) {
    return (
      <div className={mode === 'fullscreen' ? "h-full w-full bg-black text-white flex flex-col items-center justify-center p-4" : "rounded-2xl border p-4"}>
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="text-4xl">✓</div>
          <h2 className="text-xl font-semibold">Session Complete!</h2>
          <p className="text-muted-foreground text-center">
            Saved {savedCount} vocabulary word{savedCount !== 1 ? 's' : ''} to scene "{selectedScene?.name || 'Unknown'}"
          </p>
          <Button onClick={startNewSession} variant="default">
            Start New Session
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={mode === 'fullscreen' ? "relative h-full w-full bg-black flex flex-col" : "rounded-2xl border p-4"}>
      {mode !== 'fullscreen' && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium">Scene Capture</h2>
          {!running ? (
            <Button
              onClick={startCamera}
              variant="outline"
              className="text-sm"
              disabled={!selectedSceneId}
            >
              Start
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={() => setFullscreen(true)} variant="outline" className="text-xs" title="Fullscreen">Fullscreen</Button>
              <Button onClick={stopCamera} variant="outline" className="text-sm">Stop</Button>
            </div>
          )}
        </div>
      )}

      {/* Scene selection - shown before camera starts */}
      {!running && (
        <div className={`space-y-3 z-10 ${mode === 'fullscreen' ? 'p-4 bg-black/50 backdrop-blur-sm rounded-lg mt-16 mx-4 mb-4' : 'mt-4'}`}>
          <label className={`text-sm font-medium ${mode === 'fullscreen' ? 'text-white' : ''}`}>Select a Scene</label>
          {loadingScenes ? (
            <div className="text-sm text-muted-foreground">Loading scenes...</div>
          ) : teacherScenes.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No scenes available. Ask your teacher to create scenes for your class.
            </div>
          ) : (
            <select
              value={selectedSceneId}
              onChange={(e) => setSelectedSceneId(e.target.value)}
              className="w-full p-2 rounded-lg border bg-background text-sm"
            >
              <option value="">-- Select a scene --</option>
              {teacherScenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          )}
          {selectedScene && (
            <div className="text-xs text-muted-foreground">
              {selectedScene.description}
              {(selectedScene.vocab?.length || 0) > 0 && (
                <span className="block mt-1">
                  Teacher vocab: {selectedScene.vocab?.length} word{selectedScene.vocab?.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 mb-2 px-4">{error}</div>
      )}

      <div className={`${(mode === 'fullscreen' || fullscreen) ? 'relative flex-1 w-full bg-black overflow-hidden' : 'relative aspect-video w-full mx-auto overflow-hidden rounded-xl bg-black max-h-[calc(100vh-16rem)] mt-4'}`}>
        {fullscreen && mode !== 'fullscreen' && (
          <div className="absolute top-3 right-3 z-50">
            <Button
              onClick={() => setFullscreen(false)}
              variant="secondary"
              className="text-xs px-2 py-1"
              title="Exit Fullscreen"
            >
              Exit
            </Button>
          </div>
        )}

        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
          playsInline
          muted
          autoPlay
        />

        {!running && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 cursor-pointer z-0"
            onClick={() => selectedSceneId && startCamera()}
          >
            <div className="text-white text-lg font-medium mb-2 opacity-50">Camera Not Active</div>
            {selectedSceneId ? (
              <>
                <Button onClick={(e) => { e.stopPropagation(); startCamera(); }} variant="default" className="text-sm">
                  Start Camera
                </Button>
                <div className="text-white/70 text-xs mt-3 text-center px-4">
                  Click anywhere to start capturing for "{selectedScene?.name}"
                </div>
              </>
            ) : (
              <div className="text-white/70 text-xs mt-3 text-center px-4">
                Select a scene above to start capturing
              </div>
            )}
          </div>
        )}

        {/* Scene info overlay - top left */}
        {running && selectedScene && (
          <div className={`absolute left-3 z-10 pointer-events-auto ${mode === 'fullscreen' ? 'top-16' : 'top-3'}`}>
            <OverlayCard className="p-2">
              <div className="text-xs font-medium text-white">{selectedScene.name}</div>
            </OverlayCard>
          </div>
        )}

        {/* Captured vocab overlay - below scene info */}
        {running && capturedObjects.length > 0 && (
          <div className={`absolute left-3 z-10 w-[70%] max-w-xs pointer-events-auto ${mode === 'fullscreen' ? 'top-28' : 'top-14'}`}>
            <OverlayCard className="p-3 max-h-[40vh] overflow-y-auto">
              <div className="text-xs text-white/70 mb-2">
                {capturedObjects.length} word{capturedObjects.length !== 1 ? 's' : ''} captured
              </div>
              <ul className="space-y-1">
                {capturedObjects.map((obj, idx) => (
                  <li key={idx} className="text-xs text-white flex justify-between gap-2">
                    <span className="truncate">{obj.source_name}</span>
                    <span className="text-white/60 truncate">{obj.target_name}</span>
                  </li>
                ))}
              </ul>
            </OverlayCard>
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            onClick={captureFrame}
            variant="default"
            className="text-xs"
            disabled={!running || isExtracting}
            title="Capture"
          >
            Capture
          </Button>
          <Button
            onClick={endSession}
            variant="destructive"
            className="text-xs"
            disabled={!running || capturedObjects.length === 0}
            title="End Session"
          >
            Save & End
          </Button>
        </div>

        {/* Loading indicator */}
        {isExtracting && (
          <div className="pointer-events-none absolute inset-x-0 top-3 p-3 flex items-center justify-center">
            <OverlayCard className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <DotsScaleIcon size={14} className="text-white" />
              <span>Extracting Vocabulary...</span>
            </OverlayCard>
          </div>
        )}

        {/* Capture preview */}
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

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

