import { useState, type FormEvent } from "react";
import { Activity } from "lucide-react";
import type { AuthPage } from "@/components/posture-coach/types";
import { GoogleIcon } from "@/components/posture-coach/posture-icons";

export function AuthScreen({
  authPage,
  setAuthPage,
  onGoogleLogin,
  authMessage,
  isGoogleLoading,
}: {
  authPage: AuthPage;
  setAuthPage: (page: AuthPage) => void;
  onGoogleLogin: () => void;
  authMessage: string | null;
  isGoogleLoading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormMessage("Google 로그인만 지원합니다.");
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Activity className="h-10 w-10 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">Posture Analyzer</span>
          </div>
          <p className="text-gray-600">웹캠 기반 자세 분석 서비스</p>
        </div>

        <div className="app-surface p-8">
          <div className="mb-6 flex gap-1 border border-[rgba(18,100,76,0.18)] bg-[rgba(196,246,232,0.36)] p-1">
            <button
              type="button"
              onClick={() => setAuthPage("login")}
              className={`flex-1 py-2 font-medium ${
                authPage === "login" ? "bg-white text-blue-600" : "text-gray-600"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setAuthPage("signup")}
              className={`flex-1 py-2 font-medium ${
                authPage === "signup" ? "bg-white text-blue-600" : "text-gray-600"
              }`}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {authPage === "signup" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full border border-gray-300 bg-white px-4 py-3 focus:outline-none"
                  placeholder="홍길동"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-gray-300 bg-white px-4 py-3 focus:outline-none"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-gray-300 bg-white px-4 py-3 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {authPage === "login" && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span className="text-gray-600">로그인 상태 유지</span>
                </label>
                <button type="button" className="text-blue-600">
                  비밀번호 찾기
                </button>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 py-3 font-medium text-white"
            >
              {authPage === "login" ? "로그인" : "회원가입"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-300" />
            <span className="text-sm text-gray-500">또는</span>
            <div className="h-px flex-1 bg-gray-300" />
          </div>

          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={isGoogleLoading}
            className="flex w-full items-center justify-center gap-3 border border-gray-300 bg-white px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGoogleLoading ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <span className="font-medium text-gray-700">Google 계정 연동 중...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span className="font-medium text-gray-700">
                  Google로 {authPage === "login" ? "로그인" : "시작하기"}
                </span>
              </>
            )}
          </button>

          {(formMessage || authMessage) && (
            <div className="mt-5 border border-blue-100 bg-blue-50 p-3 text-center text-sm text-blue-900">
              {authMessage ?? formMessage}
            </div>
          )}

          <div className="mt-6 text-center text-sm text-gray-600">
            {authPage === "login" ? (
              <p>
                계정이 없으신가요?{" "}
                <button
                  type="button"
                  onClick={() => setAuthPage("signup")}
                  className="font-medium text-blue-600"
                >
                  회원가입
                </button>
              </p>
            ) : (
              <p>
                이미 계정이 있으신가요?{" "}
                <button
                  type="button"
                  onClick={() => setAuthPage("login")}
                  className="font-medium text-blue-600"
                >
                  로그인
                </button>
              </p>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-gray-500">
            로그인 후 분석 기록을 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}



