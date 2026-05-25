# PostureAI

웹캠 기반 자세 분석과 스트레칭 코칭을 제공하는 Next.js 프로젝트입니다. 사용자의 상체 관절 위치를 실시간으로 추적해 목, 허리/상체 기울기, 자세 안정성을 점수화하고, 분석 결과에 따라 맞춤형 스트레칭을 추천합니다.

## 프로젝트 소개

PostureAI는 장시간 컴퓨터를 사용하는 사용자가 자신의 자세 상태를 바로 확인하고 관리할 수 있도록 만든 자세 코칭 웹 애플리케이션입니다. MediaPipe Pose로 웹캠 영상에서 신체 랜드마크를 추출하고, 자체 분석 로직을 통해 자세 점수와 피드백을 제공합니다.

단순히 점수만 보여주는 것이 아니라, 나쁜 자세가 지속될 때 알림을 보내고, 세션별 기록과 최고/최저 자세 스냅샷을 저장해 사용자가 자신의 변화 추이를 확인할 수 있도록 구성했습니다.

## 주요 기능

- 실시간 웹캠 자세 분석
  - 목 기울기, 상체 기울기, 자세 흔들림을 기반으로 종합 점수 산출
  - 좌/우 측면 자동 선택 또는 고정 분석 지원
  - 관절 랜드마크 오버레이 표시

- 자세 피드백 및 알림
  - 점수에 따른 정상, 주의, 경고 상태 표시
  - 나쁜 자세가 일정 시간 지속되면 브라우저/Windows 알림 제공
  - 경고 기준 점수와 지속 시간 사용자 설정 가능

- 맞춤 스트레칭 코칭
  - 목, 어깨, 손목, 허리, 다리 스트레칭 제공
  - 현재 자세 문제와 최근 기록을 기반으로 스트레칭 우선순위 추천
  - 스트레칭 동작을 가이드 자세와 비교해 일치율과 교정 메시지 제공

- 기록 관리
  - Firebase Authentication을 활용한 Google 로그인
  - Firestore에 세션 기록, 평균 점수, 알림 횟수, 사용 시간 저장
  - Firebase Storage에 최고/최저 자세 스냅샷 이미지 저장
  - 날짜별 기록과 최근 24시간 요약 확인

## 기술 스택

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- MediaPipe Pose
- Firebase Authentication, Firestore, Storage
- Recharts
- Lucide React

## 실행 방법

```bash
npm install
npm run dev
```

개발 서버 실행 후 브라우저에서 `http://localhost:3000`으로 접속합니다.

## 환경 변수

Firebase 연동을 사용하려면 `.env.local`에 다음 값을 설정합니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Firebase 설정이 없으면 저장 기능은 제한되지만, 프로젝트 구조와 일부 클라이언트 기능은 확인할 수 있습니다.

## 프로젝트 구조

```text
app/                         Next.js App Router 페이지와 전역 스타일
components/posture-coach-app.tsx
                             자세 분석 앱의 주요 화면과 상호작용 로직
lib/posture-analysis.ts      자세 점수 계산 및 피드백 로직
lib/stretch-analysis.ts      스트레칭 동작 분석 및 추천 데이터
lib/stretch-guide.ts         스트레칭 가이드 포즈와 개인화 보정 로직
lib/stretch-recommendation.ts
                             자세 기록 기반 스트레칭 추천 로직
lib/firebase.ts              인증, 기록 저장, 스냅샷 업로드 연동
public/mediapipe/            MediaPipe Pose 실행에 필요한 로컬 모델 파일
```

## 기대 효과

이 프로젝트는 사용자가 별도 장비 없이 웹캠만으로 자신의 자세를 점검할 수 있게 합니다. 실시간 피드백, 알림, 기록, 스트레칭 추천을 하나의 흐름으로 연결해 자세 교정 습관을 만들 수 있도록 돕는 것이 목표입니다.
