import type { ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { Activity, AlertTriangle, Dumbbell, History, House, LogOut, User, Video } from "lucide-react";
import type { Tab } from "@/components/posture-coach/types";

type AppChromeProps = {
  activeTab: Tab;
  alertMessage: string | null;
  authUser: FirebaseUser;
  cameraText: string;
  cameraTone: "good" | "warn" | "danger" | "neutral";
  storageText: string;
  storageTone: "good" | "warn" | "danger";
  children: ReactNode;
  onLogout: () => Promise<void>;
  onTabChange: (tab: Tab) => void;
};

export function AppChrome(props: AppChromeProps) {
  const { activeTab, alertMessage, authUser, cameraText, cameraTone, storageText, storageTone, children, onLogout, onTabChange } = props;
  return (
    <div className="app-shell min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-[#12644C]/20 bg-[#C4F6E8]">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="flex flex-col gap-1.5 py-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-bold text-gray-900">Posture Analyzer</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium ${cameraTone === "good" ? "text-[#18755B]" : cameraTone === "danger" ? "text-red-700" : cameraTone === "warn" ? "text-yellow-700" : "text-gray-600"}`}>
                  <span className="app-status-dot" />{cameraText}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium ${storageTone === "good" ? "text-[#18755B]" : storageTone === "danger" ? "text-red-700" : "text-yellow-700"}`}>
                  <span className="app-status-dot" />{storageText}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex max-w-full items-center gap-2 border border-gray-200 px-2 py-1 text-gray-700">
                  {authUser.photoURL ? <img src={authUser.photoURL} alt="" className="h-7 w-7 rounded-full border border-white object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-gray-50"><User className="h-4 w-4 text-gray-600" /></span>}
                  <span className="max-w-[180px] truncate text-sm">{authUser.displayName ?? authUser.email}</span>
                </div>
                <button type="button" onClick={() => void onLogout()} className="flex items-center gap-2 border border-transparent px-2 py-1 text-sm text-gray-700"><LogOut className="h-4 w-4" />로그아웃</button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-[1100px] px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">
        {alertMessage && <section className="mb-6 border border-yellow-200 bg-yellow-50 p-5"><div className="mb-2 flex items-center justify-between gap-3"><h3 className="font-bold text-yellow-950">자세 주의</h3><AlertTriangle className="h-5 w-5 text-yellow-600" /></div><p className="text-sm leading-6 text-yellow-800">{alertMessage}</p></section>}
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-50 bg-white pb-[calc(0.5rem+env(safe-area-inset-bottom))]" aria-label="하단 내비게이션">
        <div className="w-full border-t border-[#12644C]/20 px-2 pt-1"><div className="mx-auto grid max-w-[560px] grid-cols-4">
          {[
            { id: "home" as Tab, label: "홈", icon: <House className="h-5 w-5" /> },
            { id: "analysis" as Tab, label: "자세 분석", icon: <Video className="h-5 w-5" /> },
            { id: "stretching" as Tab, label: "스트레칭 분석", icon: <Dumbbell className="h-5 w-5" /> },
            { id: "history" as Tab, label: "기록 보기", icon: <History className="h-5 w-5" /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs leading-tight ${isActive ? "font-bold text-[#18755B]" : "text-gray-500"}`}><span className={`absolute top-0 h-0.5 w-5 ${isActive ? "bg-[#18755B]" : "bg-transparent"}`} />{tab.icon}<span className="max-w-full truncate whitespace-nowrap">{tab.label}</span></button>;
          })}
        </div></div>
      </nav>
    </div>
  );
}
