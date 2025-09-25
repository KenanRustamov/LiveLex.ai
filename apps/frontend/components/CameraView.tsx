'use client';

// Placeholder for a future camera component.
// Intentionally does nothing yet per starter requirements.
// Suggested outline:
// - Use getUserMedia({ video: { facingMode: 'environment' } }) to request camera.
// - Draw frames to a <canvas> for lightweight preprocessing.
// - Send sampled frames via fetch/WebSocket to the backend for vision-language tasks.

export default function CameraView() {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-sm text-gray-600">Camera placeholder (not active).</p>
    </div>
  );
}
