import { useEffect, useRef, useState } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

export default function useVadPredefined(
  enabled: boolean,
  handlers: { onSpeechStart?: () => void; onSpeechRealStart?: () => void; onSpeechEnd?: (audio?: Float32Array) => void }
) {
  // Keep handler refs stable to avoid recreating VAD on every render
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  const [listening, setListening] = useState(false);
  const vadRef = useRef<any>(null);

  const preBufferRef = useRef<Float32Array[]>([]);
  const PREBUFFER_MS = 200;
  const MAX_PREBUFFER_FRAMES = 30;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const vad = await MicVAD.new({
          startOnLoad: true,
          
          baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web/dist/',
          onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/',
          model: 'legacy',
          
          preSpeechPadFrames: 20,
          
          positiveSpeechThreshold: 0.45,
          negativeSpeechThreshold: 0.35,
          minSpeechFrames: 3,
          redemptionFrames: 8,
          
          onSpeechStart: () => {
            console.log('[VAD] Speech start detected');
            handlersRef.current.onSpeechStart?.();
          },
          
          onVADMisfire: () => {
            console.log('[VAD] Misfire detected');
          },
          
          onSpeechEnd: (speechAudio: Float32Array) => {
            console.log('[VAD] Speech end detected', speechAudio.length);
            handlersRef.current.onSpeechEnd?.(speechAudio);
          },
        } as any);
        try {
          console.log('[VAD] initialized', {
            baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web/dist/',
            onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/',
          });
        } catch {}
        if (cancelled) {
          try { vad.pause(); vad.destroy?.(); } catch {}
          return;
        }
        vadRef.current = vad;
        await vad.start();
        try { console.log('[VAD] started listening'); } catch {}
        if (!cancelled) setListening(true);
      } catch (e) {
        try { console.error('[VAD] failed to initialize/start', e); } catch {}
      }
    }
    async function stop() {
      try {
        const vad = vadRef.current;
        if (vad) {
          try { vad.pause?.(); } catch {}
          try { vad.destroy?.(); } catch {}
        }
      } finally {
        vadRef.current = null;
        setListening(false);
        try { console.log('[VAD] stopped/destroyed'); } catch {}
      }
    }

    if (enabled) start(); else stop();
    return () => { cancelled = true; stop(); };
  }, [enabled]);

  return { listening };
}
