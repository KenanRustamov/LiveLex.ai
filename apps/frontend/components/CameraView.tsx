'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import useAudioRecorder from '../hooks/useAudioRecorder';
import useVadPredefined from '../hooks/useVadPredefined';
import PlanChecklist from './PlanChecklist';
import TranscriptOverlay from './TranscriptOverlay';
import LessonSummary from './LessonSummary';
import { DotsScaleIcon } from '@/components/ui/icons/svg-spinners-3-dots-scale';
import StatusBadge from '@/components/StatusBadge';
import OverlayCard from '@/components/OverlayCard';

const CAPTURE_PREVIEW_DURATION_MS = 3000;

function float32ToWavBlob(audio: Float32Array, sampleRate = 16000): Blob {
  const numSamples = audio.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  let offset = 0;
  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  };

  writeString('RIFF');
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString('WAVE');

  // fmt chunk
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 8 * bytesPerSample, true); offset += 2;

  // data chunk
  writeString('data');
  view.setUint32(offset, dataSize, true); offset += 4;

  // PCM samples
  for (let i = 0; i < numSamples; i++, offset += 2) {
    let s = audio[i];
    s = Math.max(-1, Math.min(1, s));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export default function CameraView({ settings, username, onClose }: { settings: { sourceLanguage: string; targetLanguage: string; location: string; actions: string[], proficiencyLevel: number; }, username: string, onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const capturePreviewTimerRef = useRef<number | null>(null);
  const capturePreviewUrlRef = useRef<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);

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
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [utteranceId, setUtteranceId] = useState<string | null>(null);
  const [speechReal, setSpeechReal] = useState<boolean>(false);
  const [planReceived, setPlanReceived] = useState<boolean>(false);
  const [evaluationResults, setEvaluationResults] = useState<Map<number, { correct: boolean; feedback: string; correct_word: string }>>(new Map());
  const [lessonSummary, setLessonSummary] = useState<any>(null);

  // Grammar mode state
  const [grammarMode, setGrammarMode] = useState<boolean>(false);
  const [grammarTense, setGrammarTense] = useState<'present' | 'past'>('present');

  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000',
    []
  );
  const wsUrl = useMemo(() => backendUrl.replace(/^http/, 'ws'), [backendUrl]);

  // iOS requires at least one user-gesture initiated audio action before programmatic playback is allowed.
  // programmatic playback is allowed. We "unlock" audio once when the user
  // taps Start by playing a single silent sample via Web Audio.
  const unlockAudio = useCallback(() => {
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        // Ensure resumed if previously suspended
        audioCtxRef.current.resume().catch(() => { });
        return;
      }
      const AnyAudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AnyAudioCtx) return;
      const ctx: AudioContext = new AnyAudioCtx();
      audioCtxRef.current = ctx;
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (e) {
      console.warn('Audio unlock failed', e);
    }
  }, []);

  // Function to play audio from base64 data
  const playAudioFromBase64 = useCallback((base64Audio: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
      currentAudioRef.current = audio;
      setIsTtsPlaying(true);

      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
        currentAudioRef.current = null;
        setIsTtsPlaying(false);
      });

      audio.onended = () => {
        currentAudioRef.current = null;
        setIsTtsPlaying(false);
      };

      audio.onerror = () => {
        console.error('Audio playback error');
        currentAudioRef.current = null;
        setIsTtsPlaying(false);
      };
    } catch (error) {
      console.error('Error creating audio from base64:', error);
      currentAudioRef.current = null;
      setIsTtsPlaying(false);
    }
  }, []);

  const openWs = useCallback(() => {
    try {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
      const ws = new WebSocket(`${wsUrl}/v1/ws`);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'control', payload: { action: 'set_username', username } }));
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
              }
              break;
            }
            case 'prompt_next': {
              const text: string = msg.payload?.text ?? '';
              if (text) {
                setTranscripts(prev => [...prev, { speaker: 'LLM', text }]);
              }
              // Play TTS audio if available
              const audio: string | undefined = msg.payload?.audio;
              if (audio) {
                playAudioFromBase64(audio);
              }
              break;
            }
            case 'hint': {
              const text: string = msg.payload?.text ?? '';
              if (text) {
                setTranscripts(prev => [...prev, { speaker: 'LLM', text }]);
              }
              const audio: string | undefined = msg.payload?.audio;
              if (audio) {
                playAudioFromBase64(audio);
              }
              break;
            }
            case 'answer_given': {
              const text: string = msg.payload?.text ?? '';
              if (text) {
                setTranscripts(prev => [...prev, { speaker: 'LLM', text }]);
              }
              const audio: string | undefined = msg.payload?.audio;
              if (audio) {
                playAudioFromBase64(audio);
              }
              break;
            }
            case 'evaluation_result': {
              const correct: boolean = msg.payload?.correct ?? false;
              const feedback: string = msg.payload?.feedback ?? '';
              const objectIndex: number = msg.payload?.object_index ?? -1;
              const correctWord: string = msg.payload?.correct_word ?? '';

              if (objectIndex >= 0) {
                setEvaluationResults(prev => {
                  const next = new Map(prev);
                  next.set(objectIndex, { correct, feedback, correct_word: correctWord });
                  return next;
                });
                if (feedback) {
                  setTranscripts(prev => [...prev, { speaker: 'LLM', text: feedback }]);
                }
              }
              // Play TTS audio if available
              const audio: string | undefined = msg.payload?.audio;
              if (audio) {
                playAudioFromBase64(audio);
              }
              break;
            }
            case 'lesson_complete': {
              const summary = msg.payload;
              if (summary) {
                // Store summary and disable further VAD-driven attempts on the frontend
                setLessonSummary(summary);
                setPlanReceived(false);
              }
              break;
            }
            case 'plan': {
              const objects = msg.payload?.objects ?? null;
              if (Array.isArray(objects)) setPlanObjects(objects);
              // Commented out to prevent scene_message from appearing in transcript
              // const sceneMsg: string | null = msg.payload?.scene_message ?? null;
              // if (typeof sceneMsg === 'string') {
              //   setTranscripts(prev => [...prev, { speaker: 'LLM', text: sceneMsg }]);
              // }
              setIsPlanLoading(false);
              setShowCapturePrompt(false);
              setPlanReceived(true);
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
  }, [wsUrl, username, playAudioFromBase64]);

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
    setError(null);
    try {
      // Stop any existing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      // Check if video element is available
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

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser. Please use a modern browser.');
      }

      console.log('Requesting camera access with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Camera stream obtained:', stream);
      streamRef.current = stream;

      // Bind the stream and wait for video to be ready
      video.srcObject = stream;
      console.log('Video srcObject set, waiting for metadata...');

      // Wait for the video to load metadata before playing
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
          console.log('Video metadata loaded, readyState:', video.readyState);
          resolve();
        };
        const onError = (err: Event) => {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          console.error('Video element error:', err);
          reject(new Error('Video element failed to load'));
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onError);

        // If metadata is already loaded, resolve immediately
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          console.log('Video already has metadata');
          resolve();
        }
      });

      // Play the video
      try {
        await video.play();
        console.log('Video playback started successfully');
      } catch (playError: any) {
        // If autoplay fails, try to play with user interaction
        console.warn('Autoplay failed, video should play on user interaction:', playError);
        // The video should still work, just needs user interaction
      }

      // Verify the stream is active
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video tracks found in stream');
      }
      if (!videoTracks[0].enabled) {
        throw new Error('Video track is disabled');
      }
      console.log('Video track is active:', {
        enabled: videoTracks[0].enabled,
        readyState: videoTracks[0].readyState,
        settings: videoTracks[0].getSettings()
      });

      // Check video dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('Video dimensions are 0x0, but continuing...');
      } else {
        console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      }

      setRunning(true);
      openWs();
    } catch (e: any) {
      console.error('Camera start error:', e);
      let errorMessage = 'Failed to start camera';
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else if (e?.name === 'NotReadableError' || e?.name === 'TrackStartError') {
        errorMessage = 'Camera is already in use by another application.';
      } else if (e?.name === 'OverconstrainedError' || e?.name === 'ConstraintNotSatisfiedError') {
        errorMessage = 'Camera does not support the requested settings. Trying with default settings...';
        // Could retry with simpler constraints here
      } else if (e?.message) {
        errorMessage = e.message;
      }
      setError(errorMessage);
      setRunning(false);
      // Clean up stream on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    }
  }, [facing, openWs]);

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
            actions: settings.actions,
            proficiency_level: settings.proficiencyLevel,
            grammar_mode: grammarMode,
            grammar_tense: grammarTense,
          }
        }));
      }
    } catch { }
  }, [facing, grammarMode, grammarTense, settings]);

  useEffect(() => {
    return () => {
      stopCamera();
      // Clean up audio on unmount
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, [stopCamera]);

  // Ensure video plays when stream is set
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;

    const handleLoadedMetadata = () => {
      video.play().catch((err) => {
        console.warn('Video autoplay failed:', err);
      });
    };

    // If video already has metadata, try playing immediately
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.play().catch((err) => {
        console.warn('Video play failed:', err);
      });
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [running]);

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

  // update completed state based on evaluation results
  useEffect(() => {
    if (planObjects && evaluationResults.size > 0) {
      setCompleted(prev => {
        const next = [...prev];
        evaluationResults.forEach((result, idx) => {
          if (idx < next.length) {
            next[idx] = result.correct;
          }
        });
        return next;
      });
    }
  }, [evaluationResults, planObjects]);

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
    } catch (_) { }
  }, [audioBlob, backendUrl]);

  // VAD integration: enable only while lesson is in progress (plan present and no summary yet),
  // and NOT while TTS is playing to avoid the model hearing its own voice.
  const vadEnabled = running && planReceived && !lessonSummary && !isTtsPlaying;

  const captureSceneDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return null;
    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      if (facing === 'user') {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, w, h);
      }
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch {
      return null;
    }
  }, [facing]);

  const sendAudioBlobWithOptionalImage = useCallback(async (blob: Blob) => {
    const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUtteranceId(id);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const buf = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        wsRef.current.send(JSON.stringify({ type: 'audio_chunk', payload: { data_b64: b64, mime: blob.type || 'audio/webm', utterance_id: id } }));
        wsRef.current.send(JSON.stringify({ type: 'audio_end', payload: { utterance_id: id } }));
        const dataUrl = captureSceneDataUrl();
        if (dataUrl) {
          wsRef.current.send(JSON.stringify({
            type: 'image',
            payload: {
              data_url: dataUrl,
              mime: 'image/jpeg',
              target_language: settings.targetLanguage,
              source_language: settings.sourceLanguage,
              location: settings.location,
              actions: settings.actions,
              utterance_id: id,
              grammar_mode: grammarMode,
              grammar_tense: grammarTense,
            }
          }));
        }
      } catch { }
    } else {
      // HTTP fallback for audio only
      try {
        const form = new FormData();
        form.append('file', blob, 'audio.webm');
        const res = await fetch(`${backendUrl}/v1/transcribe`, { method: 'POST', body: form });
        if (res.ok) {
          const { text } = await res.json();
          setTranscripts(prev => [...prev, { speaker: 'User', text }]);
        }
      } catch { }
    }
  }, [backendUrl, captureSceneDataUrl, settings, grammarMode, grammarTense]);

  const vad = useVadPredefined(vadEnabled, {
    onSpeechStart: () => {
      if (isTtsPlaying) return; // extra guard
      try { console.log('[VAD] onSpeechStart'); } catch { }
      // We rely on MicVAD's internal preSpeechPadMs to include leading audio,
      // so we don't need to manually start a separate MediaRecorder here.
      setSpeechReal(false);
    },
    onSpeechRealStart: () => {
      if (isTtsPlaying) return;
      try { console.log('[VAD] onSpeechRealStart'); } catch { }
      setSpeechReal(true);
    },
    onSpeechEnd: async (audio?: Float32Array) => {
      if (isTtsPlaying) return;
      try { console.log('[VAD] onSpeechEnd, audioLen=', audio?.length ?? null); } catch { }
      if (audio && audio.length > 0) {
        const blob = float32ToWavBlob(audio);
        await sendAudioBlobWithOptionalImage(blob);
      }
      setSpeechReal(false);
    },
  });

  // Debounce display of Listening chip to reduce flashing
  const [showListening, setShowListening] = useState<boolean>(false);
  useEffect(() => {
    let t: number | null = null;
    const shouldShow = !isRecording && vadEnabled && !isPlanLoading;
    if (shouldShow) {
      t = window.setTimeout(() => setShowListening(true), 200);
    } else {
      setShowListening(false);
    }
    return () => { if (t) window.clearTimeout(t); };
  }, [isRecording, vadEnabled, isPlanLoading]);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Camera</h2>
        {!running ? (
          <Button
            onClick={() => {
              unlockAudio();
              startCamera();
            }}
            variant="outline"
            className="text-sm"
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

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
      {audioError && (
        <div className="text-sm text-red-600">{audioError}</div>
      )}

      {lessonSummary ? (
        <LessonSummary
          summary={lessonSummary}
          onNewLesson={() => {
            setLessonSummary(null);
            // Reset local lesson state
            setPlanObjects(null);
            setPlanMessage(null);
            setShowCapturePrompt(true);
            setEvaluationResults(new Map());
            setTranscripts([]);
            setPlanReceived(false);

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'control',
                payload: { action: 'reset_lesson' }
              }));
            }

            // Ensure camera + WebSocket are ready for a fresh lesson
            if (!running) {
              startCamera().catch(() => {
                // ignore errors here; they will surface via existing error handling
              });
            }
          }}
        />
      ) : (
        <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-black overflow-hidden m-0' : 'relative aspect-video w-full mx-auto overflow-hidden rounded-xl bg-black max-h-[calc(100vh-16rem)]'}`}>
          {fullscreen && (
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
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 cursor-pointer z-20"
              onClick={startCamera}
            >
              <div className="text-white text-lg font-medium mb-2">Camera Not Active</div>
              <Button onClick={(e) => { e.stopPropagation(); startCamera(); }} variant="default" className="text-sm">
                Start Camera
              </Button>
              <div className="text-white/70 text-xs mt-3 text-center px-4">
                Click anywhere to start the camera and grant permissions
              </div>
            </div>
          )}

          {showCapturePrompt && !isPlanLoading && (
            <div className="pointer-events-none absolute inset-x-0 top-3 p-3 flex items-center justify-center">
              <div className="text-white text-sm text-center drop-shadow">
                Please capture the scene.
              </div>
            </div>
          )}

          {isRecording && !speechReal && (
            <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-center justify-center">
              <StatusBadge status="detecting" />
            </div>
          )}

          {isRecording && speechReal && (
            <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-center justify-center">
              <StatusBadge status="recording" />
            </div>
          )}

          {showListening && (
            <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-center justify-center">
              <StatusBadge status="listening" />
            </div>
          )}

          {/* Grammar Mode Toggle - positioned in upper left */}
          {running && !lessonSummary && (
            <div className="absolute top-3 left-3 z-10 pointer-events-auto">
              <OverlayCard className="p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="grammar-mode"
                    checked={grammarMode}
                    onCheckedChange={setGrammarMode}
                    disabled={isPlanLoading}
                  />
                  <Label htmlFor="grammar-mode" className="text-xs cursor-pointer whitespace-nowrap">
                    Grammar Mode
                  </Label>
                </div>

                {grammarMode && (
                  <div className="flex gap-1">
                    <Button
                      variant={grammarTense === 'present' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGrammarTense('present')}
                      className="text-xs py-0 h-6"
                    >
                      Present
                    </Button>
                    <Button
                      variant={grammarTense === 'past' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGrammarTense('past')}
                      className="text-xs py-0 h-6"
                    >
                      Past
                    </Button>
                  </div>
                )}
              </OverlayCard>
            </div>
          )}

          {/* Plan overlay - moved to below grammar toggle */}
          {planObjects && planObjects.length > 0 && (
            <div className="absolute left-3 top-24 z-10 w-[70%] max-w-xs pointer-events-auto">
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
            {planObjects && (
              <Button onClick={() => { setPlanObjects(null); setPlanMessage(null); setShowCapturePrompt(true); }} variant="outline" className="text-xs" title="Retake">Retake</Button>
            )}
            <Button
              onClick={() => {
                try {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'control', payload: { action: 'end_session' } }));
                  }
                } catch { }
              }}
              variant="destructive"
              className="text-xs"
              disabled={!running}
              title="End Session"
            >
              End Session
            </Button>
          </div>

          {isPlanLoading && (
            <div className="pointer-events-none absolute inset-x-0 top-3 p-3 flex items-center justify-center">
              <OverlayCard className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <DotsScaleIcon size={14} className="text-white" />
                <span>Analyzing Scene</span>
              </OverlayCard>
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

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
}