export type RecordingBundle = {
  recorder: MediaRecorder;
  done: Promise<Blob | null>;
  stop: () => void;
};

export function createRecorder(stream: MediaStream): RecordingBundle | null {
  if (!("MediaRecorder" in window)) {
    return null;
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];

  const done = new Promise<Blob | null>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }) : null);
    };
    recorder.onerror = () => resolve(null);
  });

  return {
    recorder,
    done,
    stop: () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }
  };
}

function pickMimeType() {
  const options = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return options.find((option) => MediaRecorder.isTypeSupported(option)) ?? "";
}
