# PostureAI 핵심 알고리즘 및 설계 분석

> 면접 대비용 기술 소논문 — 실제 저장소 구현을 기준으로 작성

## 초록

PostureAI는 브라우저의 웹캠 영상에서 MediaPipe Pose가 추출한 신체 랜드마크를 받아, 사용자의 목과 몸통 기울기 및 프레임 간 움직임을 점수화하고, 장시간 나쁜 자세를 감지하며, 개인 체형에 맞춘 스트레칭 코칭과 기록 분석을 제공하는 Next.js 애플리케이션이다. 이 프로젝트의 기술적 핵심은 단순한 AI 모델 호출이 아니라 다음 문제들을 하나의 실시간 파이프라인으로 연결한 데 있다.

1. 정규화 좌표를 실제 영상 종횡비가 반영된 픽셀 좌표로 바꾸어 각도를 계산한다.
2. 불완전하거나 가려진 관절을 명시적으로 거부하고, 이동 평균으로 추론 노이즈를 완화한다.
3. 정적 자세는 공간 정규화 후 가이드 포즈와 비교하고, 동적 자세는 방향 전환과 운동 범위를 이용해 반복 횟수를 판정한다.
4. React 렌더링과 독립적으로 고주파 실시간 상태를 `ref`에 유지하면서, 사용자에게 보여 줄 저주파 상태만 발행한다.
5. 인증 사용자별로 세션 요약, 시계열 점수, 알림, 스트레칭 로그, 최고·최저 자세 이미지를 Firestore와 Storage에 분리 저장한다.

이 문서는 위 알고리즘의 수학적 근거, 실제 코드 구조, 시간·공간 복잡도, 동시성 설계, 한계와 개선안, 면접 예상 질문까지 설명한다. 의료 진단 시스템이 아니라 휴리스틱 기반의 자세 코칭 시스템이라는 경계도 중요하게 다룬다.

---

## 1. 프로젝트의 문제 정의

### 1.1 입력과 출력

입력은 매 프레임의 MediaPipe Pose 랜드마크 배열이다. 각 랜드마크는 대략 다음 구조를 가진다.

```ts
type Landmark = {
  x: number;          // 영상 너비에 대해 정규화된 좌표
  y: number;          // 영상 높이에 대해 정규화된 좌표
  z?: number;         // 모델 기준 상대 깊이
  visibility?: number;
};
```

자세 분석은 선택된 측면의 귀(7/8), 어깨(11/12), 골반(23/24)을 사용한다. 출력은 0~100점의 종합 점수, 목·몸통·안정성 세부 점수, 주요 문제 부위, 피드백, 추적 가능 여부이다. 스트레칭 분석은 관절별 일치 점수, 잘못된 신체 부위, 교정 문구, 유지 시간 또는 반복 횟수를 출력한다.

### 1.2 핵심 요구사항

- 카메라 해상도와 종횡비가 달라도 각도가 일관되어야 한다.
- 일부 관절이 화면 밖에 있거나 가려졌을 때 잘못된 점수를 만들면 안 된다.
- 랜드마크의 프레임별 떨림이 UI와 알림을 요동시키지 않아야 한다.
- 고정 자세와 반복 동작을 서로 다른 방법으로 판정해야 한다.
- 실시간 루프가 React의 과도한 재렌더링을 유발하지 않아야 한다.
- 세션 종료 시 비동기 이미지 업로드와 요약 저장 사이의 경합을 피해야 한다.

---

## 2. 전체 아키텍처와 실행 흐름

주요 계층은 다음과 같다.

```text
Webcam MediaStream
  └─ usePoseCamera
      ├─ requestAnimationFrame 루프
      ├─ MediaPipe Pose.send(video)
      └─ pose.onResults(results)
          └─ useAnalysisRuntime.handlePoseResults
              ├─ appMode === "posture"
              │   └─ PostureAnalyzer.analyze
              │       ├─ posture-metrics: 좌표/각도
              │       ├─ 점수화 및 이동 평균
              │       └─ usePostureSession
              │           ├─ 세션 누적 평균
              │           ├─ 알림
              │           ├─ 최고/최저 이미지
              │           └─ Firestore 시계열 저장
              └─ appMode === "stretching"
                  └─ useStretchSession.processFrame
                      ├─ calibration-engine
                      ├─ coaching-engine
                      ├─ 정적 유지/동적 반복 판정
                      └─ 스트레칭 로그
```

`useAnalysisRuntime`은 일종의 오케스트레이터다. 카메라, 자세 세션, 스트레칭 세션을 조합하고 `paused | posture | stretching` 모드에 따라 동일한 Pose 결과의 소비자를 바꾼다. 이 분리는 모델 추론을 중복 실행하지 않고도 두 기능을 제공한다.

주요 파일:

- `components/posture-coach/hooks/use-pose-camera.ts`: 카메라 및 추론 루프
- `components/posture-coach/hooks/use-analysis-runtime.ts`: 모드 전환과 세션 생명주기
- `lib/posture-analysis.ts`: 실시간 자세 판정
- `lib/posture/posture-metrics.ts`: 2D/3D 기하 계산
- `lib/stretching/calibration-engine.ts`: 체형 보정과 좌표 정규화
- `lib/stretching/coaching-engine.ts`: 정적·동적 스트레칭 판정
- `components/posture-coach/hooks/use-posture-session.ts`: 집계, 알림, 스냅샷
- `lib/repositories/firebase-client.ts`: Firebase 경계

---

## 3. 카메라와 MediaPipe 추론 파이프라인

### 3.1 단일 비동기 프레임 루프

카메라는 `getUserMedia`로 1280×720을 요청하고, MediaPipe Pose에는 다음 옵션을 적용한다.

```ts
pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.55,
  minTrackingConfidence: 0.55,
});
```

중요한 부분은 프레임 루프가 다음 프레임을 무조건 병렬 제출하지 않고 `await detector.send(...)` 후 다음 `requestAnimationFrame`을 예약한다는 점이다.

```ts
const loop = async () => {
  if (videoIsReady && detectorIsCurrent) {
    pendingFrameMetadataRef.current.push(metadata);
    await detector.send({ image: currentVideo });
  }
  if (detectorRef.current === detector) {
    rafIdRef.current = requestAnimationFrame(() => void loop());
  }
};
```

이 구조는 자연스러운 backpressure를 만든다. 추론이 40ms 걸리면 60FPS 카메라라도 초당 25회 정도만 처리되므로, 처리하지 못할 프레임이 무한히 큐에 쌓이지 않는다. 시간 복잡도는 프레임당 모델 추론 비용을 제외하면 애플리케이션 로직이 `O(L)`이며, `L`은 랜드마크 수로 MediaPipe Pose에서는 사실상 상수다.

### 3.2 결과와 프레임 메타데이터의 결합

MediaPipe의 콜백은 원래 영상 크기를 직접 보존하지 않으므로, 요청 시점에 `{ videoWidth, videoHeight, timestamp }`를 큐에 넣고 결과 콜백에서 `shift()`한다. 실패한 `send`는 해당 메타데이터를 다시 제거한다. 이는 각도 계산에 필요한 실제 종횡비와 결과 프레임을 결합하기 위한 간단한 FIFO 프로토콜이다.

면접 포인트: 현재는 `send`를 직렬로 기다리므로 FIFO가 안전하다. 나중에 병렬 추론을 허용한다면 순서 역전 가능성이 생기므로 frame ID 기반 `Map`이나 결과 자체의 타임스탬프가 필요하다.

### 3.3 로컬 모델 자산과 장애 대응

`locateFile`은 `/mediapipe/pose/${file}`을 반환한다. 따라서 WASM, TFLite 및 packed assets를 `public/mediapipe`에서 직접 제공해 CDN 장애나 버전 변동을 줄인다. 스크립트 로더와 비디오 준비에는 각각 15초, 10초 타임아웃이 있고, 카메라 중지 시 RAF 취소, detector 종료, MediaStream track 종료, 메타데이터 큐 초기화를 수행한다.

---

## 4. 자세 각도 계산: 가장 중요한 기하 알고리즘

### 4.1 왜 정규화 좌표로 바로 각도를 구하면 안 되는가

MediaPipe의 `x`, `y`는 각각 너비와 높이로 나눈 값이다. 16:9 영상에서 `(Δx, Δy)=(0.1, 0.1)`은 실제 픽셀로는 `(128, 72)`이므로 45도가 아니다. 정규화 공간에서 바로 `atan2`를 쓰면 화면 종횡비에 따라 같은 자세가 다른 각도로 측정된다.

구현은 먼저 픽셀 공간으로 복원한다.

```ts
function toPixelPoint(lm: Landmark, frame: FrameSize) {
  return {
    x: lm.x * frame.videoWidth,
    y: lm.y * frame.videoHeight,
  };
}
```

이 변경은 `CURRENT_SCORING_VERSION = "aspect-corrected-image-v2"`로 버전 관리된다. 과거 저장 데이터는 버전 필드가 없으면 `legacy-normalized-image-v1`로 간주해 의미가 조용히 바뀌지 않게 한다.

### 4.2 수직선 기준 절대 각도

화면 좌표는 아래쪽이 +y이므로, 어깨에서 귀로 향하는 목 벡터와 골반에서 어깨로 향하는 몸통 벡터는 정상 자세에서 위쪽, 즉 `-y` 방향을 가리킨다.

벡터 `v=(vx, vy)`의 수직선 기준 각도는 다음과 같다.

```text
θ_vertical = |atan2(vx, -vy)| × 180/π
```

실제 코드:

```ts
export function getAngleFromVertical2D(vector: Vector2D): number | null {
  if (length2D(vector) <= 1e-9) return null;
  return Math.abs(toDegrees(Math.atan2(vector.x, -vector.y)));
}
```

목 벡터는 `ear - shoulder`, 몸통 벡터는 `shoulder - hip`이다. 왼쪽과 오른쪽 측면 모두 절댓값을 사용하므로 같은 기울기는 같은 점수가 된다.

### 4.3 벡터 사이 상대 각도

목과 몸통 사이의 상대 각도도 계산한다.

```text
θ = acos(clamp((a·b)/(|a||b|), -1, 1)) × 180/π
```

부동소수점 오차로 내적 비율이 1.00000001이 되면 `acos`가 `NaN`을 반환할 수 있으므로 반드시 `[-1,1]`로 clamp한다. 현재 종합 점수에는 절대 목 각도와 몸통 각도를 사용하고, 상대 각도는 원시 비교·진단용으로 남겨져 있다.

### 4.4 데이터 유효성 방어

계산 전 다음을 순서대로 확인한다.

1. 프레임 너비와 높이가 유한한 양수인가?
2. 귀, 어깨, 골반 랜드마크가 존재하는가?
3. 각 visibility가 0.42보다 큰가?
4. `x`, `y`가 유한수인가?
5. 벡터 길이가 `1e-9`보다 큰가?

실패 원인은 `invalid-frame-size`, `missing-landmark`, `invalid-landmark`, `low-visibility`, `zero-length-vector`의 판별 합집합으로 반환한다. 예외를 던지는 대신 invalid 결과를 값으로 표현했기 때문에 호출자가 추적 실패 UI를 안정적으로 만들 수 있다.

또한 invalid 프레임은 이동 평균 이력, 움직임 이력, 이전 중심점을 갱신하지 않는다. 그렇지 않으면 추적이 복구된 첫 프레임이 거대한 움직임으로 오인되거나 0점이 평균을 오염시킬 수 있다. 이 불변조건은 테스트로 검증된다.

### 4.5 3차원 shadow metric

`calculateWorldPostureMetrics`는 `x,y,z`로 동일한 세 각도를 계산한다. 수직 각도는 다음 식이다.

```text
θ_3D = acos(|vy| / ||v||) × 180/π
```

현재 제품 점수는 image metric을 사용하며 world metric은 비교용이다. 이 선택은 합리적이다. 단안 카메라의 z는 절대 깊이가 아니고 흔들림이 클 수 있는 반면, 측면 자세의 2D 투영은 설명하기 쉽다. 다만 카메라가 정확한 측면이 아닐 때 2D 각도는 원근 왜곡에 취약하다.

---

## 5. 자세 점수, 평활화, 안정성

### 5.1 구간형 점수 함수

목 점수:

| 목 각도 | 점수 |
|---:|---:|
| ≤10° | 100 |
| ≤20° | 85 |
| ≤35° | 70 |
| ≤50° | 50 |
| >50° | 30 |

몸통 점수:

| 몸통 각도 | 점수 |
|---:|---:|
| ≤5° | 100 |
| ≤12° | 80 |
| ≤20° | 60 |
| >20° | 35 |

최종 점수는 평활화된 세부 점수의 가중합이다.

```text
score = round(0.55 × neck + 0.30 × trunk + 0.15 × stability)
```

목을 가장 크게 반영하고 몸통, 안정성 순으로 반영한다. 장점은 설명 가능성과 튜닝 용이성이다. 단점은 임계점 20° 전후에서 1° 변화가 큰 점수 점프를 만들고, 임계 구간 안에서는 변화가 전혀 반영되지 않는다는 것이다. 연속 함수나 로지스틱 곡선은 이를 완화할 수 있지만 사용자에게 기준을 설명하기는 더 어렵다.

### 5.2 두 층의 이동 평균

`PostureAnalyzer`는 최근 12개 유효 프레임의 `PostureMetrics`를 단순 이동 평균한다. 안정성은 별도로 최근 30개 프레임에서 신체 중심 이동량을 평균한다.

```ts
center = average(ear, shoulder, hip)
movement = hypot(center.x - previous.x, center.y - previous.y)
stabilityAverage = mean(last30Movements)
```

안정성 점수는 `<0.012 → 100`, `<0.025 → 80`, 그 외 `60`이다. 좌표가 0~1로 정규화되어 있으므로 해상도와 무관하지만, 프레임 레이트에는 영향을 받는다. 같은 실제 움직임도 FPS가 높으면 프레임당 이동량이 작아진다. 더 견고한 방법은 `movement / Δt`, 즉 초당 속도를 쓰는 것이다.

두 히스토리는 최대 길이가 12와 30이므로 공간 복잡도는 `O(1)`로 볼 수 있다. 다만 매 프레임 `shift()`와 전체 합산을 하므로 엄밀히 `O(W)`이다. W가 작아 실용적 문제는 없지만 running sum과 ring buffer를 쓰면 `O(1)` 갱신이 가능하다.

### 5.3 목 하중 추정

0°, 15°, 30°, 45°, 60°에 대응하는 하중 5, 12.2, 18.1, 22.2, 27.2kg을 두 점 사이에서 선형 보간한다.

```text
load = lower.load + (upper.load - lower.load) × ratio
```

60° 초과는 각도 1°당 0.12kg을 외삽한다. 이 값은 의학적 진단이 아니라 사용자 피드백용 추정치다. 면접에서는 “논문 상 수치를 제품 문구로 사용할 때 출처, 불확실성, 법적 표현을 어떻게 관리할 것인가”를 반드시 언급하는 편이 좋다.

### 5.4 주요 문제 선택

모든 점수가 양호하면 `balanced`다. 아니면 안정성 점수가 75 미만이면서 다른 두 점수 이하일 때 안정성, 몸통이 80 미만이면서 목보다 5점 이상 낮거나 60 이하이면 몸통, 목이 85 미만이면 목을 선택한다. 단순 최솟값이 아니라 부위별 정상 기준과 5점 margin을 둔 규칙 기반 의사결정이다.

### 5.5 프레임 점수와 세션 점수의 구분

세션에는 세 시간 척도가 공존한다.

- 프레임 점수: 12프레임 평활화 결과
- 표시용 실시간 점수: 설정된 1~5초 구간의 평균
- 세션 평균: 지금까지 모든 유효 프레임의 누적 평균

누적 평균은 전체 배열을 다시 더하지 않고 `total/count`로 `O(1)` 갱신한다. 차트에는 최근 24개 표시 포인트만 유지하고, 로컬 샘플은 최근 120개만 유지한다. Firestore에는 최소 10초 간격으로 시계열 점수를 저장해 쓰기 비용을 제한한다.

---

## 6. 알림과 화면 효과: 시간 기반 상태 머신

### 6.1 나쁜 자세 알림

점수가 사용자 임계값 이하가 되면 `badPostureStartedAt`을 최초 한 번 설정한다. 설정 시간(기본 5분, 테스트 모드 1초)이 지나고 기존 알림 표시 시간이 끝났을 때 알림을 발생시킨다. 발생 후 시작 시간을 현재로 재설정하므로 나쁜 자세가 계속되면 주기적으로 다시 알릴 수 있다.

이 방식의 핵심은 프레임 수가 아니라 wall-clock time을 사용한다는 점이다. FPS가 달라도 “5분 지속”의 의미가 동일하다.

주의할 구현 특성: 현재 `handlePoseResults`는 프레임 결과 대신 `recordPostureScore`가 만든 세션 누적 평균을 `updateAlerts`에 넘긴다. 따라서 세션 초반의 좋은 자세가 길수록 최근 나쁜 자세가 경고 임계값에 도달하는 데 오래 걸릴 수 있다. 의도가 “현재의 지속된 나쁜 자세”라면 프레임 평활 점수 또는 별도의 최근 창 평균을 넘기는 편이 정확하다.

### 6.2 화면 깨짐 효과 상태 머신

`posture-screen-effect.ts`는 순수 함수형 상태 머신이다.

- 목 각도 >40°가 7초 지속: `none → cracked`
- 목 각도 >50°가 10초 지속: `cracked/none → shattered`
- 21~40°: 이미 생긴 crack은 유지
- ≤20°가 0.5초 지속: `→ none`
- tracking loss 1초 미만: 상태 유지, 그 시간은 누적하지 않음
- tracking loss 1초 이상: 초기화

상승 전이에서만 소리를 재생하고 5초 cooldown을 둔다. 상태와 입력을 인자로 받고 새 상태를 반환하므로 경계값 테스트가 쉽다. 테스트는 정확히 40°/50°에서는 발동하지 않는 점, 추적 유예, 회복 hysteresis, 소리 cooldown까지 검증한다.

이 설계는 히스테리시스의 좋은 예다. 발동 기준(40/50°)과 해제 기준(20°)을 분리해 경계 근처에서 상태가 깜빡이는 것을 막는다.

---

## 7. 스트레칭 개인화: 체형 캘리브레이션과 좌표 정규화

### 7.1 캘리브레이션 값

2초 동안 최소 12개 샘플을 모으고, 움직임이 0.09 이내인 프레임을 사용한다. 각 샘플은 다음을 계산한다.

- 어깨 너비
- 몸통 길이
- 골반 너비
- 왼팔/오른팔 길이: 어깨→팔꿈치 + 팔꿈치→손목
- 어깨 중심과 골반 중심

골반이 보이지 않으면 `torsoLength ≈ max(shoulderWidth × 1.25, 0.18)`, 팔이 보이지 않으면 `armLength ≈ torsoLength × 2.12`로 대체한다. 여러 샘플의 산술 평균으로 최종 체형을 만든다.

### 7.2 guide space 정규화

사용자 관절을 다음 좌표계로 옮긴다.

```text
x' = (x - shoulderCenter.x) / shoulderWidth
y' = (y - shoulderCenter.y) / torsoLength
```

이 변환은 위치 이동과 전체 크기 차이를 제거한다. 사용자가 화면의 왼쪽/오른쪽에 있거나 카메라에 더 가까워도 비슷한 guide coordinate가 나온다. 완전한 회전 불변성은 없기 때문에 카메라 기울기와 몸의 회전에는 여전히 민감하다.

### 7.3 체형에 맞춘 가이드 포즈

가이드 템플릿은 어깨 반너비가 0.5, 몸통 길이가 약 1인 정규 좌표로 정의된다. 캘리브레이션된 팔/몸통 비율을 기본 비율 2.12와 비교해 팔 길이를 0.82~1.22 범위로 스케일하고, 골반/어깨 비율로 골반 너비를 0.28~0.46 범위로 조정한다.

```ts
leftScale = clamp(
  (leftArmLength / torsoLength) / 2.12,
  0.82,
  1.22
);
```

무제한 개인화가 아니라 합리적인 범위로 clamp하는 이유는 잘못된 추론 한 프레임이 비현실적인 가이드를 만들지 못하게 하기 위해서다.

### 7.4 좌우 미러 변형

각 템플릿은 원본과 미러 버전을 모두 만든다. 미러링은 x 부호를 반전하는 동시에 `leftWrist ↔ rightWrist`처럼 관절 이름도 교환한다. 이후 두 변형 중 점수가 높은 것을 선택하므로 사용자가 어느 방향으로 동작하든 동일한 단계로 판정할 수 있다.

---

## 8. 정적 스트레칭 자세 매칭

### 8.1 관절 좌표 점수

사용자 점 `u`와 가이드 점 `g` 사이의 정규화 거리로 점수를 만든다.

```text
coordinateScore = clamp(100 - ||u-g|| / tolerance × 100, 0, 100)
```

각도 점수도 같은 형태다.

```text
angleScore = clamp(100 - |userAngle-guideAngle| / tolerance × 100, 0, 100)
```

팔꿈치·무릎 각도는 세 점 `a-b-c`에 대해 dot과 cross를 이용한 `atan2(|cross|, dot)`으로 계산한다. 단순 `acos`보다 0~180°를 안정적으로 얻고 별도의 정규화가 덜 필요하다.

### 8.2 부위별 혼합 점수

각 check type은 필요한 부위 목록을 가진다. 예를 들어 `leg-calf-stretch`는 양팔과 양다리, `neck-side-pull`은 목과 왼팔을 요구한다.

- 목: 좌표 평균 48% + 각도 평균 52%
- 나머지: 좌표 평균 62% + 각도 평균 38%

부위 점수 <70이면 incorrect part, <78이면 교정 문구 대상이다. 전체 점수 ≥85일 때 유효 자세다. 목·어깨·등 주요 스트레칭은 일반 좌표 비교 대신 어깨 수평, 몸통 방향, 골반 안정성, 손과 머리 거리 같은 의미 기반 feature를 혼합한다. 이 하이브리드 방식은 템플릿의 정확한 픽셀 위치에 과도하게 맞추는 문제를 줄인다.

### 8.3 시간 평활화와 5초 유지

hook 레벨에서는 원시 매칭 점수에 지수 이동 평균을 적용한다.

```text
smoothed = previous × 0.75 + current × 0.25
```

평활 점수가 85 이상인 상태가 5초 지속되어야 단계가 완료된다. 한 프레임이라도 기준 아래로 내려가면 hold 시작 시각을 초기화한다. UI 발행은 800ms 간격으로 제한하지만 내부 판정은 각 추론 프레임에서 계속 수행한다. 즉, 정확한 판정 주기와 React 업데이트 주기를 분리한다.

완료된 단계 번호는 `Set`으로 중복 완료를 방지하고, 단계 완료 및 전체 완료 로그를 별도로 저장한다.

---

## 9. 동적 스트레칭: 반복 검출 상태 머신

정적 자세와 달리 목 돌리기와 골반 돌리기는 한 포즈에 가까운지를 측정해서는 완료를 판정할 수 없다. 구현은 사용자 주도 궤적을 추적한다.

### 9.1 런타임 상태

```ts
type DynamicStretchRuntimeState = {
  lastValue: number | null;
  lastDirection: -1 | 0 | 1;
  reachedLeft: boolean;
  reachedRight: boolean;
  repeatCount: number;
  currentCycleScores: number[];
  speedSamples: number[];
  minValue: number;
  maxValue: number;
  smoothedScore: number | null;
};
```

목 동작의 movement value는 정규화된 머리 x좌표, 골반 동작은 어깨 중심과 골반 중심을 잇는 선의 각도다.

### 9.2 방향과 한 사이클 검출

현재 값과 이전 값의 차이가 작은 dead zone 안이면 방향 0, 증가하면 +1, 감소하면 -1이다. 왼쪽 임계와 오른쪽 임계에 각각 도달한 사실을 기록한다. 이전에 +1로 움직이다 -1이 되면 오른쪽 끝에서 turn, 반대는 왼쪽 끝에서 turn이다.

양쪽 임계에 모두 도달했고 끝점에서 방향 전환이 일어날 때 한 사이클 후보가 된다. 후보는 다음 조건을 모두 통과해야 반복으로 인정된다.

```text
averageCycleScore ≥ 70
range = maxValue - minValue ≥ minRange
imbalance = ||minValue| - |maxValue|| ≤ maxImbalance
```

따라서 가운데에서 작게 떨거나 한쪽으로만 움직이는 동작은 횟수로 세지 않는다. 완료 목표는 3회다.

### 9.3 목 동적 점수

목은 예상 곡선과의 거리 36%, 좌우 범위 26%, 대칭성 20%, 속도 18%를 사용한다. 프레임 간 속도는 `|Δx| / Δt`로 계산한다. 0.45 이하를 좋은 속도로 보고 그 이상은 감점한다. 점수 자체에도 `0.82 previous + 0.18 current` EMA를 적용한다.

### 9.4 등/골반 동적 점수

몸통 선 각도를 movement value로 사용하며 범위 36%, 균형 26%, 속도 24%, 중심 제어 14%다. ±14° 임계, 최소 전체 범위 18°, 최대 좌우 불균형 10°를 사용한다. 최근 속도가 너무 빠르거나 범위가 부족하거나 불균형하면 우선순위 교정 메시지를 만든다.

시간 복잡도는 매 프레임 최근 점수 최대 90개와 속도 최대 60개의 평균을 구하므로 `O(W)`이고, 공간도 상한이 있어 `O(1)`이다.

---

## 10. 스트레칭 추천 알고리즘

추천은 현재 자세와 최근 세션 통계를 결합한 설명 가능한 규칙 기반 랭킹이다.

부위별 기준은 목 85, 몸통 80, 안정성 75다.

```text
현재 문제가 해당 부위임               +3
최근 낮은 점수 비율이 35% 이상         +2
최근 평균이 부위 기준 미만              +1
```

목은 목 스트레칭, 몸통은 어깨·등, 안정성은 등·어깨로 매핑한다. 한 스트레칭이 여러 부위에서 추천되면 점수를 합산한다. 이유는 중복 없이 최대 2개만 보존한다. 동점은 유지 스트레칭 기본 순서로 안정 정렬한다.

최근 통계를 합칠 때 평균의 평균을 내지 않고 각 세션의 표본 수로 가중한다.

```text
mergedAverage = Σ(sessionAverage × sessionCount) / Σ(sessionCount)
```

이는 표본 10개의 세션과 1000개의 세션을 같은 비중으로 취급하는 통계 오류를 피한다. 추천 근거가 없지만 현재 또는 과거 데이터가 있으면 낮은 우선순위 유지 스트레칭 3개를 제공하고, 데이터 자체가 없으면 분석을 먼저 하도록 안내한다.

---

## 11. 성장 예측과 자세 키 미리보기

### 11.1 최종 키 예측

`growth-posture.ts`는 성별·10~18세 연령별 한국 성장도표의 -3σ~+3σ 키 anchor를 보유한다. 현재 키가 어느 두 anchor 사이에 있는지 선형 보간해 z-score를 구하고, 동일 z-score 위치를 최종 월령(227개월) anchor에 투영한다.

```text
current height → interpolated z-score
z-score → final-age interpolated height
```

백분위는 정규분포 CDF이며, CDF 계산에 오차함수 근사를 사용한다.

```text
percentile = Φ(z) × 100
Φ(z) = 1/2 × (1 + erf(z/√2))
```

도표 범위를 벗어난 값은 z-score를 ±3으로 clamp하되 `isOutsideChartRange`로 표시한다. 이는 외삽으로 비현실적 예측을 만드는 대신 결과의 한계를 명시하는 선택이다.

### 11.2 자세에 따른 시각적 키 패널티

좋은 범위를 초과한 목과 몸통 각도를 각각 0~1 severity로 정규화하고 65:35로 합친 뒤 최대 5cm 패널티를 보여 준다.

```text
penalty = 5cm × (0.65 × neckSeverity + 0.35 × trunkSeverity)
```

이는 실제 성장 손실 예측이 아니라 올바른 자세가 외관상 키와 정렬에 미치는 효과를 설명하기 위한 UI 모델이다. 면접에서 의료적 인과로 오해되지 않도록 제품 문구와 명칭을 엄격히 분리해야 한다.

---

## 12. React 실시간 상태 관리 설계

### 12.1 왜 `useState`만 쓰지 않았는가

추론 콜백은 초당 수십 번 실행될 수 있다. 매 프레임의 세션 ID, 누적 합, 타이머, 최근 랜드마크를 state로 갱신하면 렌더링이 폭증하고 비동기 콜백의 stale closure 문제가 생긴다. 구현은 다음을 `ref`로 유지한다.

- analyzer 인스턴스
- 현재 설정과 UID
- 세션 ID와 시작 시각
- 점수 합계/개수/최근 창
- 알림 및 hold 시작 시각
- 최고·최저 스냅샷
- 진행 중인 이미지 업로드 Promise
- 최신 스트레칭 결과와 동적 상태

화면에 실제로 보여야 하는 점수, 차트 포인트, 모달 상태만 state로 발행한다. 이 패턴은 “mutable realtime core + declarative UI projection”으로 설명할 수 있다.

### 12.2 ref proxy로 순환 의존성 끊기

카메라는 결과 콜백이 필요하고, 결과 콜백은 posture/stretch hook이 필요하며, 이 hook들은 현재 프레임 캡처 함수가 필요하다. `poseFrameHandlerRef`, `startAppHandlerRef`, `captureFrameHandlerRef`와 안정적인 proxy callback을 사용해 생성 순서와 stale closure 문제를 해결한다.

대가도 있다. ref는 React가 일관성을 보장하지 않으므로 초기화/정리 누락이 버그가 되기 쉽다. 실제 `startApp`과 `stopApp`에 긴 reset 목록이 존재한다. reducer 또는 명시적 session state machine으로 옮기면 불변조건을 중앙화할 수 있다.

### 12.3 자세와 스트레칭 모드의 시간 회계

스트레칭 모드로 들어갈 때 자세 분석이 실행 중이었다면 `posturePausedStartedAt`을 기록한다. 종료할 때 총 pause 시간에 더하고, 최종 자세 사용 시간은 다음처럼 구한다.

```text
postureDuration = wallClockDuration - accumulatedPause - currentActivePause
```

따라서 같은 카메라 세션 안에서 스트레칭한 시간이 자세 측정 시간으로 잘못 집계되지 않는다.

---

## 13. 최고·최저 자세 스냅샷과 비동기 경합 제어

### 13.1 점수와 이미지 점수 분리

전체 자세 점수에는 안정성이 들어가지만 정지 사진은 안정성을 표현하지 못한다. 따라서 이미지 후보 점수는 목 65%, 몸통 35%만으로 다시 계산한다. 이것은 데이터 표현과 metric의 의미를 일치시키는 좋은 설계다.

### 13.2 업로드 억제 정책

최고/최저 이미지가 아직 없으면 업로드한다. 이후에는 기존 이미지 점수보다 최소 3점 좋아지거나 나빠졌고, 마지막 업로드 후 10초 이상 지났을 때만 덮어쓴다. 각 종류별 `uploadInProgress` flag로 중복 업로드를 막는다.

### 13.3 세션 종료 barrier

업로드 Promise를 `bestImageUploadPromiseRef`, `worstImageUploadPromiseRef`에 보관하고 세션 종료 시 `Promise.allSettled`로 기다린 뒤 Firestore 요약을 저장한다. 그렇지 않으면 세션 문서가 이미지 URL 없이 먼저 확정되는 race condition이 생긴다.

`allSettled`를 사용했기 때문에 이미지 하나가 실패해도 세션 종료 자체는 계속된다. 이는 부가 기능 실패가 핵심 기록을 막지 않는 graceful degradation이다.

잠재적 한계: 업로드 중 더 좋은/나쁜 후보가 나타나면 현재 구현은 그 후보를 큐에 보관하지 않고 건너뛴다. “마지막 pending candidate” 슬롯을 두면 업로드 완료 직후 최신 극값을 재평가할 수 있다.

---

## 14. Firebase 데이터 모델과 보안

### 14.1 데이터 구조

```text
users/{uid}
  ├─ settings/app
  ├─ sessionTitles/{sessionTitleKey}
  └─ sessions/{sessionId}
      ├─ scorePoints/{timestamp-uuid}
      ├─ alerts/{uuid}
      ├─ stretchLogs/{uuid}
      └─ snapshots/{id}        # 삭제 루틴이 호환 목적으로 처리

Storage:
users/{uid}/sessions/{sessionId}/best.jpg
users/{uid}/sessions/{sessionId}/worst.jpg
```

세션 루트에는 시작/종료 시각, 평균, 사용 시간, 알림 수, 부위 통계, 최고·최저 점수와 이미지 메타데이터, scoring version이 저장된다. 상세 시계열과 이벤트를 하위 컬렉션에 분리해 요약 조회 비용을 낮춘다.

### 14.2 런타임 정규화와 하위 호환성

Firestore는 schemaless이므로 읽을 때 수치 범위, 날짜, 배열 요소, 랜드마크 좌표, 설정 값을 정규화한다. 알 수 없는 scoring version은 legacy로 처리한다. 설정의 bad posture 시간은 1~10분, 실시간 표시 간격은 1~5초로 clamp한다.

이 경계 계층은 외부 데이터가 애플리케이션 내부 타입을 오염시키지 않게 한다. TypeScript 타입 단언만으로는 원격 데이터의 런타임 안전성을 보장할 수 없다는 점이 면접 핵심이다.

### 14.3 보안 규칙

Firestore는 `/users/{uid}` 이하에서 `request.auth.uid == uid`인 사용자만 읽고 쓸 수 있다. Storage는 같은 UID 조건에 더해 파일명이 `best.jpg` 또는 `worst.jpg`, 크기 1MB 이하, MIME type `image/jpeg`인 경우만 create/update를 허용한다.

클라이언트가 경로에 UID를 넣는 것만으로는 보안이 되지 않는다. 서버 규칙이 UID 일치를 검증하기 때문에 수평 권한 상승을 막는다.

### 14.4 삭제의 한계

기록 삭제는 Storage 이미지, 알려진 하위 컬렉션, 세션 문서, 제목 문서를 순서대로 삭제한다. 병렬 `Promise.all`로 빠르게 처리하지만 Firestore transaction/batch가 아니므로 중간 실패 시 일부만 삭제될 수 있다. 또한 클라이언트가 모르는 새 하위 컬렉션은 자동 재귀 삭제되지 않는다. 운영 규모에서는 Cloud Function/서버 관리 삭제 작업과 idempotent tombstone이 더 안전하다.

---

## 15. 테스트 전략과 현재 검증 범위

프로젝트는 Vitest를 사용한다. 특히 알고리즘 경계 테스트가 좋다.

- `lib/posture/posture-metrics.test.ts`
  - 잘못된 프레임 크기 거부
  - 16:9/9:16에서 종횡비 보정
  - 좌우 대칭 입력의 같은 각도
  - zero-length vector
  - 2D와 world metric 분리
- `lib/posture-analysis.test.ts`
  - 기존 점수 구간
  - invalid 프레임이 metric/motion history를 오염시키지 않음
  - 프레임 크기 fallback을 허용하지 않음
- `lib/posture/posture-screen-effect.test.ts`
  - 40°와 50° 경계
  - 지속 시간, 회복, tracking grace
  - 상승 전이 소리와 cooldown
- `lib/repositories/scoring-version.test.ts`
  - 구 데이터의 legacy 처리
- `lib/growth-posture.test.ts`
  - 표준점수 보간, 범위 clamp, 백분위 표시
- `lib/posture-height-preview.test.ts`
  - 정상 구간 0 패널티, 최대 5cm, 가중 결합

부족한 부분도 분명하다.

1. 정적 스트레칭 포즈 매칭의 합성 랜드마크 테스트가 없다.
2. 동적 반복 검출에서 noise, 방향 전환, 불충분 범위, 한쪽 치우침 테스트가 없다.
3. 추천 점수 합산과 동점 정렬 테스트가 없다.
4. Firebase emulator를 이용한 보안 규칙과 부분 실패 테스트가 없다.
5. hook 수준에서 start/stop 및 업로드 race를 검증하는 테스트가 없다.
6. 실제 녹화 영상 corpus에 대한 정확도 회귀 테스트가 없다.

가장 가치 있는 다음 테스트는 라벨링된 랜드마크 시퀀스를 fixture로 저장하고, 버전별 점수·알림 시각·반복 횟수를 snapshot이 아닌 의미 있는 허용 오차로 검증하는 것이다.

---

## 16. 구현상의 중요한 한계와 개선 우선순위

### 16.1 자동 측면 선택의 문서-구현 불일치

README는 좌/우 자동 선택 또는 고정을 언급하지만 현재 `SideMode`는 `"left" | "right"`뿐이다. `selectSide`도 두 고정 모드 외에는 `null`을 반환한다. 실제 자동 모드를 추가하려면 다음이 필요하다.

- 타입에 `auto` 추가
- 좌우 visibility score 비교
- 작은 점수 차이에서는 기존 side를 유지하는 hysteresis
- side 전환 시 metric/motion history 초기화

단순히 매 프레임 더 잘 보이는 쪽을 고르면 양쪽 visibility가 비슷할 때 좌우가 계속 바뀌어 점수가 흔들린다.

### 16.2 smoothing 설정이 실질적으로 비활성화 불가

설정 타입에는 `smoothingEnabled`가 있지만 Firebase 정규화와 저장에서 항상 `true`로 강제되고, analyzer도 이 값을 분기하지 않고 항상 12프레임 평균을 쓴다. UI에서 노출한다면 동작과 불일치하고, 노출하지 않는 legacy field라면 제거 또는 migration이 필요하다.

### 16.3 카메라 위치 민감도

2D 각도는 종횡비는 보정하지만 camera roll, pitch, perspective는 보정하지 않는다. 개선 방향:

- 양 어깨/골반으로 카메라 roll 추정 후 좌표 회전
- 정면/측면 적합도 classifier
- image/world metric confidence fusion
- 사용자별 neutral pose baseline을 뺀 상대 각도

### 16.4 FPS 의존 안정성

안정성의 movement는 `Δposition`이지 `Δposition/Δt`가 아니다. 메인 스레드 부하, 기기 성능, 백그라운드 탭에 따라 점수가 달라질 수 있다. timestamp를 전달해 속도로 바꾸고 비정상적으로 큰 Δt는 버리는 것이 좋다.

### 16.5 통계적 캘리브레이션

현재 임계값과 가중치는 설명 가능한 휴리스틱이지만 데이터 기반 보정 근거가 코드에 남아 있지 않다. 실제 서비스라면 전문가 라벨 데이터에 대해 precision/recall, false alert rate, 사용자별 분산을 측정하고 threshold를 scoring version과 함께 관리해야 한다.

### 16.6 성능 개선

작은 고정 창이라 현재 성능은 충분하지만 다음이 가능하다.

- 배열 `shift()` 대신 ring buffer
- 매번 reduce 대신 running sum
- 동적 점수/속도도 running aggregate
- Page Visibility API로 background 추론 중지
- 긴 작업을 Web Worker/OffscreenCanvas로 분리

### 16.7 개인정보 보호

원본 영상 스트림은 브라우저에서 처리하고 최고/최저 JPEG만 업로드한다는 점은 장점이다. 그러나 이미지와 전체 pose landmarks는 민감 정보가 될 수 있다. 보존 기간, 명시적 동의, 삭제 확인, 다운로드 URL 수명, 분석 목적 제한이 제품 정책에 필요하다.

---

## 17. 면접에서 설명할 수 있는 설계 선택

### 질문 1. “왜 MediaPipe 좌표에 바로 각도를 계산하지 않았나요?”

정규화된 x와 y는 서로 다른 축척을 갖기 때문이다. 16:9에서는 같은 0.1 변화가 x 128px, y 72px일 수 있다. 영상 너비와 높이를 곱해 등방적인 픽셀 공간으로 복원한 뒤 각도를 계산했고, 점수 의미가 바뀐 것을 scoring version으로 관리했다.

### 질문 2. “노이즈를 어떻게 줄였나요?”

모델 자체 `smoothLandmarks`, 12프레임 metric 이동 평균, 30프레임 안정성 창, 스트레칭 점수 EMA, UI 800ms throttle을 단계별로 사용한다. 각 층의 목적은 랜드마크 떨림, 움직임 판정, hold 안정성, 렌더링 빈도 제어로 서로 다르다.

### 질문 3. “이동 평균 때문에 반응이 늦어지지 않나요?”

그렇다. 안정성과 지연의 trade-off다. 12프레임은 30FPS에서 약 0.4초지만 실제 비동기 추론 FPS에 따라 달라진다. 시간 기반 window나 EMA로 바꾸면 기기별 일관성을 높일 수 있고, 경고용 최근 점수와 장기 세션 평균을 분리해야 한다.

### 질문 4. “정적 포즈와 동적 포즈를 왜 분리했나요?”

정적 포즈는 목표 형상과의 공간 유사도가 핵심이고, 동적 포즈는 범위·속도·방향 전환·대칭성이 핵심이다. 한 프레임 매칭만으로는 반복을 알 수 없으므로 동적 동작에는 시간 상태 머신을 사용했다.

### 질문 5. “동적 반복에서 오검출을 어떻게 막았나요?”

양 끝 임계 도달, 방향 전환, 최소 전체 범위, 좌우 불균형 상한, 주기 평균 점수라는 다섯 조건을 결합했다. 작은 떨림은 dead zone과 최소 범위에서, 한쪽 동작은 양 끝 도달과 imbalance에서 제거된다.

### 질문 6. “React state가 아니라 ref를 많이 쓴 이유는?”

프레임 루프의 mutable 상태는 렌더링 대상이 아니며 초당 수십 회 바뀐다. ref로 유지하면 렌더링과 stale closure를 피할 수 있다. 대신 생명주기 reset이 어려워지는 대가가 있어 장기적으로는 명시적인 상태 머신 또는 reducer가 개선 방향이다.

### 질문 7. “Firebase 쓰기 비용은 어떻게 줄였나요?”

프레임마다 저장하지 않고 점수 포인트는 최소 10초 간격으로 저장한다. UI에서도 최근 제한된 개수만 보유한다. 세션 문서는 요약용, 상세 이벤트는 하위 컬렉션으로 분리한다. 이미지도 3점 변화와 10초 cooldown으로 업로드를 억제한다.

### 질문 8. “비동기 이미지 업로드 중 사용자가 종료하면요?”

진행 중 Promise를 ref에 보관하고 종료 시 `allSettled`로 barrier를 건 뒤 최종 요약을 기록한다. 업로드 실패가 세션 저장까지 막지는 않는다. 다만 업로드 중 새 극값 후보를 놓칠 수 있어 pending candidate 개선 여지가 있다.

### 질문 9. “추천 시스템은 ML인가요?”

아니다. 현재 문제 +3, 낮은 점수 빈도 +2, 낮은 평균 +1의 설명 가능한 규칙 기반 랭킹이다. 데이터가 적고 추천 이유를 사용자에게 보여 줘야 하는 초기 제품에는 적합하다. 데이터가 축적되면 이 규칙을 baseline으로 학습 모델과 비교할 수 있다.

### 질문 10. “이 결과를 의료적으로 신뢰할 수 있나요?”

진단 결과가 아니다. 단안 2D pose, 휴리스틱 threshold, 카메라 위치의 영향을 받는 웰니스 코칭 지표다. 의료적 표현을 피하고, confidence/추적 실패를 명확히 표시하며, 전문가 검증 데이터로 성능을 측정해야 한다.

### 질문 11. “가장 먼저 리팩터링한다면?”

알림이 세션 누적 평균을 쓰는 부분을 최근 창 점수로 분리하고, 시간 기반 smoothing/안정성으로 FPS 의존성을 제거하겠다. 그다음 stretch engine과 추천 로직에 합성 시퀀스 테스트를 추가하고, 긴 hook의 reset 로직을 세션 상태 머신으로 모으겠다.

### 질문 12. “점수 버전이 왜 필요한가요?”

각도 계산이나 threshold가 바뀌면 같은 실제 자세의 점수가 달라진다. 버전이 없으면 과거와 현재 차트가 잘못 비교된다. 저장 시 알고리즘 버전을 기록하고 읽을 때 legacy default를 적용해 의미를 보존한다.

---

## 18. 짧은 코드 워크스루 예제

다음 합성 예를 생각해 보자.

```ts
const frame = { videoWidth: 1280, videoHeight: 720 };
const shoulder = { x: 0.50, y: 0.50, visibility: 0.99 };
const ear      = { x: 0.54, y: 0.35, visibility: 0.99 };
const hip      = { x: 0.48, y: 0.75, visibility: 0.99 };
```

픽셀 변환 후:

```text
shoulder = (640.0, 360.0)
ear      = (691.2, 252.0)
hip      = (614.4, 540.0)

neckVector  = ear - shoulder      = (51.2, -108.0)
trunkVector = shoulder - hip      = (25.6, -180.0)

neckAngle  = |atan2(51.2, 108.0)| ≈ 25.4° → neckScore 70
trunkAngle = |atan2(25.6, 180.0)| ≈ 8.1°  → trunkScore 80
```

움직임이 작아 안정성 100이라고 가정하면:

```text
overall = round(70×0.55 + 80×0.30 + 100×0.15)
        = round(38.5 + 24 + 15)
        = 78
```

목 점수는 정상 기준 85 미만이고 몸통은 기준 80을 만족하므로 주요 문제는 목이 된다. 이 결과는 `neck-stretch`에 현재 문제 점수 +3을 부여하며, 과거 목 저점 빈도와 평균에 따라 최대 +3이 추가될 수 있다.

이 예에서 정규화 좌표로 바로 계산했다면 목 각도는 `atan2(0.04, 0.15)≈14.9°`가 되어 점수가 85로 잘못 높아진다. 종횡비 보정이 실제 제품 점수에 얼마나 큰 영향을 주는지 보여 주는 좋은 면접 예시다.

---

## 19. 개선 로드맵

### 1단계: 정확성

- 알림 입력을 세션 누적 평균에서 최근 시간 창 점수로 분리
- 안정성을 `distance / Δt`로 변경
- camera roll 보정 및 측면 적합도 판정
- auto side + hysteresis 구현 또는 README 수정
- scoring version별 threshold와 가중치 고정

### 2단계: 검증

- 정적 포즈 합성 landmark unit test
- 동적 반복 시퀀스 test fixture
- 추천 알고리즘 table-driven test
- Firebase Emulator 보안 규칙 테스트
- 실제 영상 기반 offline regression suite

### 3단계: 구조

- 자세/스트레칭/일시정지 전이를 reducer 또는 finite-state machine으로 통합
- ring buffer와 running aggregate 도입
- 이미지 업로드 pending candidate 처리
- repository schema validator 도입
- 삭제를 서버의 idempotent job으로 이전

### 4단계: 제품 신뢰성

- confidence와 측정 품질 UI
- 사용자별 neutral calibration
- metric 근거와 한계 문구
- 이미지/랜드마크 보존 기간 및 삭제 정책
- 실험 기반 threshold 튜닝과 version migration

---

## 20. 결론

PostureAI의 난도는 MediaPipe를 호출하는 것보다, 불완전한 실시간 신호를 사용자에게 설명 가능한 점수와 행동으로 바꾸는 데 있다. 종횡비 보정 기하, 유효성 검증, 다층 평활화, 시간 기반 상태 머신, 체형 정규화, 동적 반복 검출, 저장 비용 억제와 비동기 barrier가 프로젝트의 핵심 설계다.

면접에서는 “무엇을 구현했다”에 그치지 말고 다음 세 가지를 연결해 설명하는 것이 좋다.

1. **불변조건**: invalid 프레임은 이력을 오염시키지 않고, 세션 종료는 업로드 완료를 기다리며, 사용자 데이터는 UID 규칙으로 격리된다.
2. **trade-off**: smoothing은 안정성을 높이지만 지연을 만들고, 규칙 기반 점수는 설명 가능하지만 데이터 기반 최적화가 부족하다.
3. **다음 개선**: FPS 독립 시간 모델, 자동 측면 hysteresis, 알림의 최근 창 분리, 테스트 corpus와 알고리즘 버전 관리다.

이 관점으로 설명하면 이 프로젝트는 단순 포즈 데모가 아니라 실시간 신호 처리, 프론트엔드 상태 관리, 통계 집계, 클라우드 데이터 일관성과 제품 안전성을 함께 고려한 시스템으로 제시할 수 있다.

---

## 부록 A. 핵심 상수 요약

| 항목 | 값 |
|---|---:|
| 자세 필수 관절 visibility | > 0.42 |
| 스트레칭 관절 visibility | ≥ 0.35 |
| 자세 metric smoothing window | 12 프레임 |
| 안정성 window | 30 프레임 |
| 종합 점수 가중치 | 목 55%, 몸통 30%, 안정성 15% |
| 기본 경고 점수 | ≤ 60 |
| 기본 나쁜 자세 지속 시간 | 5분 |
| 화면 crack | 목 >40°, 7초 |
| 화면 shattered | 목 >50°, 10초 |
| 화면 효과 회복 | 목 ≤20°, 0.5초 |
| tracking loss 유예 | 1초 |
| 스트레칭 calibration | 2초, 최소 12 샘플 |
| calibration 최대 움직임 | 0.09 |
| 정적 포즈 유효 점수 | ≥ 85 |
| 정적 포즈 유지 | 5초 |
| 스트레칭 피드백 UI 주기 | 800ms |
| 동적 포즈 유효 점수 | ≥ 70 |
| 동적 목표 반복 | 3회 |
| 점수 포인트 저장 최소 간격 | 10초 |
| 이미지 교체 최소 점수 차 | 3점 |
| 이미지 업로드 cooldown | 10초 |

## 부록 B. 실행 및 검증 명령

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Firebase를 사용하려면 README에 기재된 `NEXT_PUBLIC_FIREBASE_*` 환경 변수가 필요하다. 설정이 없으면 Firebase repository는 비활성 상태를 반환하며 카메라/분석 코어를 읽고 테스트하는 데는 영향을 주지 않는다.
