import { supabase, VIDEO_BUCKET } from "@/src/lib/supabase";
import { DailySession, StoredVideo, getLocalVideo, saveLocalSession } from "@/src/lib/storage";

export type Profile = {
  id: string;
  display_name: string | null;
  video_storage_enabled: boolean;
  consent_version: string | null;
  consented_at: string | null;
};

export async function ensureProfile(userId: string) {
  if (!supabase) {
    return null;
  }

  const { data: existing } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (existing) {
    return existing as Profile;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId, consent_version: null, consented_at: null })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

export async function saveConsent(userId: string, videoStorageEnabled: boolean) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      video_storage_enabled: videoStorageEnabled,
      consent_version: "patient-progress-v1",
      consented_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

export async function fetchRemoteSessions(userId: string) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("daily_sessions")
    .select("*, fau_metrics(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    dateKey: row.date_key,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    overallSymmetryScore: row.overall_symmetry_score,
    qualityScore: row.quality_score,
    videoBlobId: null,
    videoPath: row.video_path,
    algorithmVersion: row.algorithm_version,
    notes: row.notes,
    syncStatus: "synced" as const,
    metrics: (row.fau_metrics ?? []).map((metric: Record<string, unknown>) => ({
      id: metric.fau_id as string,
      au: metric.au as string,
      label: metric.label as string,
      shortLabel: metric.label as string,
      balance: metric.balance as number,
      symmetryScore: metric.symmetry_score as number,
      affectedSide: metric.affected_side as "left" | "right" | "balanced"
    }))
  }));
}

export async function syncSession(session: DailySession, videoStorageEnabled: boolean) {
  if (!supabase || !session.userId) {
    return { ...session, syncStatus: "queued" as const };
  }

  try {
    let videoPath = session.videoPath;
    if (videoStorageEnabled && session.videoBlobId && !videoPath) {
      const storedVideo = await getLocalVideo(session.videoBlobId);
      if (storedVideo) {
        videoPath = await uploadVideo(session, storedVideo);
      }
    }

    const { error: sessionError } = await supabase.from("daily_sessions").upsert({
      id: session.id,
      user_id: session.userId,
      date_key: session.dateKey,
      created_at: session.createdAt,
      duration_ms: session.durationMs,
      overall_symmetry_score: session.overallSymmetryScore,
      quality_score: session.qualityScore,
      video_path: videoPath,
      algorithm_version: session.algorithmVersion,
      notes: session.notes
    });

    if (sessionError) {
      throw sessionError;
    }

    const { error: deleteMetricsError } = await supabase.from("fau_metrics").delete().eq("session_id", session.id);
    if (deleteMetricsError) {
      throw deleteMetricsError;
    }

    const { error: metricsError } = await supabase.from("fau_metrics").insert(
      session.metrics.map((metric) => ({
        session_id: session.id,
        fau_id: metric.id,
        au: metric.au,
        label: metric.label,
        balance: metric.balance,
        symmetry_score: metric.symmetryScore,
        affected_side: metric.affectedSide
      }))
    );

    if (metricsError) {
      throw metricsError;
    }

    const synced = { ...session, videoPath, syncStatus: "synced" as const };
    await saveLocalSession(synced);
    return synced;
  } catch {
    const queued = { ...session, syncStatus: "queued" as const };
    await saveLocalSession(queued);
    return queued;
  }
}

export async function getSignedVideoUrl(videoPath: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(videoPath, 60 * 10);
  if (error) {
    return null;
  }

  return data.signedUrl;
}

async function uploadVideo(session: DailySession, video: StoredVideo) {
  if (!supabase || !session.userId) {
    return null;
  }

  const extension = video.mimeType.includes("mp4") ? "mp4" : "webm";
  const path = `${session.userId}/${session.id}/check-in.${extension}`;
  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, video.blob, {
    cacheControl: "3600",
    contentType: video.mimeType,
    upsert: true
  });

  if (error) {
    throw error;
  }

  return path;
}
