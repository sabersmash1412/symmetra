"use client";

import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, Home, LogOut, ScanFace, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthView } from "@/src/components/auth-view";
import { CaptureResult, CaptureView } from "@/src/components/capture-view";
import { DailyLogView } from "@/src/components/daily-log-view";
import { ExerciseView } from "@/src/components/exercise-view";
import { InstallHelp } from "@/src/components/install-help";
import { MirrorTherapyView } from "@/src/components/mirror-therapy-view";
import { ReviewView } from "@/src/components/review-view";
import { TodayView } from "@/src/components/today-view";
import { TrendsView } from "@/src/components/trends-view";
import { ensureProfile, fetchRemoteSessions, saveConsent, syncSession, type Profile } from "@/src/lib/sessions";
import { hasSupabaseConfig, supabase } from "@/src/lib/supabase";
import {
  DailySession,
  createSessionDraft,
  listLocalSessions,
  saveLocalSession,
  saveLocalVideo,
  type StoredVideo
} from "@/src/lib/storage";

type AppView = "today" | "capture" | "review" | "exercise" | "mirror" | "log" | "trends" | "install";

export function PatientApp() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(!hasSupabaseConfig);
  const [view, setView] = useState<AppView>("today");
  const [sessions, setSessions] = useState<DailySession[]>([]);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const isSignedIn = Boolean(user) || isLocalMode;
  const hasConsent = isLocalMode || Boolean(profile?.consented_at);
  const videoStorageEnabled = Boolean(profile?.video_storage_enabled);

  const refreshSessions = useCallback(async () => {
    const localSessions = await listLocalSessions();
    if (user) {
      await Promise.all(
        localSessions
          .filter((session) => session.syncStatus === "queued")
          .map((session) => syncSession({ ...session, userId: user.id }, videoStorageEnabled))
      );
    }

    const refreshedLocalSessions = await listLocalSessions();
    let remoteSessions: DailySession[] = [];
    if (user) {
      try {
        remoteSessions = await fetchRemoteSessions(user.id);
        await Promise.all(remoteSessions.map((session) => saveLocalSession(session)));
      } catch {
        remoteSessions = [];
      }
    }

    const merged = new Map<string, DailySession>();
    [...refreshedLocalSessions, ...remoteSessions].forEach((session) => merged.set(session.id, session));
    setSessions(Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, [user, videoStorageEnabled]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!user) {
        setProfile(null);
        return;
      }

      try {
        setProfile(await ensureProfile(user.id));
      } catch {
        setProfile(null);
      }
    }

    loadProfile();
  }, [user]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    setIsOnline(Boolean(user && supabase));
  }, [user]);

  const saveReview = useCallback(async () => {
    if (!captureResult) {
      return;
    }

    setIsSaving(true);
    let videoBlobId: string | null = null;

    if (captureResult.videoBlob) {
      videoBlobId = crypto.randomUUID();
    }

    const draft = createSessionDraft({
      userId: user?.id ?? null,
      durationMs: captureResult.durationMs,
      overallSymmetryScore: captureResult.overallSymmetryScore,
      qualityScore: captureResult.qualityScore,
      metrics: captureResult.metrics,
      videoBlobId
    });

    if (captureResult.videoBlob && videoBlobId) {
      const video: StoredVideo = {
        id: videoBlobId,
        sessionId: draft.id,
        blob: captureResult.videoBlob,
        mimeType: captureResult.videoBlob.type || "video/webm",
        createdAt: new Date().toISOString()
      };
      await saveLocalVideo(video);
    }

    if (user) {
      await saveLocalSession({ ...draft, syncStatus: "queued" });
      const synced = await syncSession({ ...draft, syncStatus: "queued" }, videoStorageEnabled);
      await saveLocalSession(synced);
    } else {
      await saveLocalSession({ ...draft, syncStatus: "local" });
    }
    await refreshSessions();
    setCaptureResult(null);
    setView("log");
    setIsSaving(false);
  }, [captureResult, refreshSessions, user, videoStorageEnabled]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsLocalMode(!hasSupabaseConfig);
  }, []);

  const acceptConsent = useCallback(
    async (videoEnabled: boolean) => {
      if (!user) {
        setIsLocalMode(true);
        return;
      }

      setProfile(await saveConsent(user.id, videoEnabled));
    },
    [user]
  );

  const content = useMemo(() => {
    if (!isSignedIn) {
      return <AuthView onLocalMode={() => setIsLocalMode(true)} />;
    }

    if (!hasConsent) {
      return <ConsentView onAccept={acceptConsent} />;
    }

    if (view === "capture") {
      return (
        <CaptureView
          onCancel={() => setView("today")}
          onComplete={(result) => {
            setCaptureResult(result);
            setView("review");
          }}
        />
      );
    }

    return (
      <main className="app-shell">
        <header className="mobile-header">
          <div className="brand-cluster">
            <div className="brand-glyph">
              <ScanFace size={18} />
            </div>
            <div>
              <p className="eyebrow">Symmetra</p>
              <h1>Daily progress log</h1>
            </div>
          </div>
          <button className="icon-button" title="Sign out" type="button" onClick={signOut}>
            <LogOut size={17} />
          </button>
        </header>

        {view === "today" && (
          <TodayView
            sessions={sessions}
            isOnline={isOnline}
            onStart={() => setView("capture")}
            onOpenExercises={() => setView("exercise")}
            onOpenMirror={() => setView("mirror")}
            onOpenInstall={() => setView("install")}
          />
        )}
        {view === "review" && captureResult && (
          <ReviewView
            result={captureResult}
            videoStorageEnabled={videoStorageEnabled}
            isSaving={isSaving}
            onRetake={() => setView("capture")}
            onSave={saveReview}
          />
        )}
        {view === "exercise" && <ExerciseView />}
        {view === "mirror" && <MirrorTherapyView />}
        {view === "log" && <DailyLogView sessions={sessions} onRefresh={refreshSessions} />}
        {view === "trends" && <TrendsView sessions={sessions} />}
        {view === "install" && <InstallHelp onDone={() => setView("today")} />}

        <BottomNav current={view} onChange={setView} />
      </main>
    );
  }, [
    acceptConsent,
    captureResult,
    hasConsent,
    isOnline,
    isSaving,
    isSignedIn,
    refreshSessions,
    saveReview,
    sessions,
    signOut,
    videoStorageEnabled,
    view
  ]);

  return content;
}

function ConsentView({ onAccept }: { onAccept: (videoEnabled: boolean) => void }) {
  const [videoEnabled, setVideoEnabled] = useState(false);

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="app-mark">
          <ShieldCheck size={26} />
        </div>
        <p className="eyebrow">Consent</p>
        <h1>Before your first check-in</h1>
        <p className="soft-copy">
          Symmetra stores daily progress values and optional videos. These values are for tracking change over time and are not a diagnosis.
        </p>
        <label className="toggle-row">
          <input checked={videoEnabled} type="checkbox" onChange={(event) => setVideoEnabled(event.target.checked)} />
          <span>Store my check-in videos in cloud storage</span>
        </label>
        <button className="button primary full" type="button" onClick={() => onAccept(videoEnabled)}>
          I agree
        </button>
      </section>
    </main>
  );
}

function BottomNav({ current, onChange }: { current: AppView; onChange: (view: AppView) => void }) {
  const items = [
    { id: "today" as const, label: "Today", icon: Home },
    { id: "exercise" as const, label: "Exercise", icon: Activity },
    { id: "log" as const, label: "Log", icon: CalendarDays },
    { id: "trends" as const, label: "Trends", icon: ChartNoAxesColumnIncreasing }
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button className={current === item.id ? "selected" : ""} key={item.id} type="button" onClick={() => onChange(item.id)}>
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
