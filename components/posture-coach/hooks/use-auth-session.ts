import { useCallback, useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { initFirebase, signInWithGoogle, subscribeToAuth, upsertUserProfile } from "@/lib/repositories/auth-repository";
import type { AuthPage } from "@/components/posture-coach/types";

export function useAuthSession() {
  const [authPage, setAuthPage] = useState<AuthPage>("login");
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [storageText, setStorageText] = useState("Firebase 확인 중");
  const [storageTone, setStorageTone] = useState<"good" | "warn" | "danger">("warn");

  useEffect(() => {
    const status = initFirebase();
    if (status.enabled) { setStorageText("Firebase 연결됨"); setStorageTone("good"); }
    else { setStorageText(status.reason === "missing-config" ? "Firebase 설정 없음" : "Firebase 사용 불가"); setStorageTone(status.reason === "missing-config" ? "warn" : "danger"); }
    return subscribeToAuth((user) => { setAuthUser(user); setIsAuthReady(true); if (user) void upsertUserProfile(user); });
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    setIsGoogleLoading(true); setAuthMessage(null);
    try { await signInWithGoogle(); }
    catch (error) { console.error("Google login failed:", error); setAuthMessage("Google 로그인에 실패했습니다. Firebase 설정을 확인해주세요."); }
    finally { setIsGoogleLoading(false); }
  }, []);

  return { authPage, authUser, isAuthReady, isGoogleLoading, authMessage, storageText, storageTone, setAuthPage, setAuthMessage, handleGoogleLogin };
}
