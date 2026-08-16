"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOutUser } from "@/lib/firebase";
import { getRecommendedStretches, getStretchById } from "@/lib/stretch-analysis";
import { calculateStretchRecommendations } from "@/lib/stretch-recommendation";
import type { StretchDefinition } from "@/lib/types";
import type { AppMode } from "@/components/posture-coach/types";
import { AuthScreen } from "@/components/posture-coach/views/auth-screen";
import { AnalysisView } from "@/components/posture-coach/views/analysis-view";
import { HomeView } from "@/components/posture-coach/views/home-view";
import { HistoryView } from "@/components/posture-coach/views/history-view";
import { StretchingView } from "@/components/posture-coach/views/stretching-view";
import { PostureCoachDialogs } from "@/components/posture-coach/views/posture-coach-dialogs";
import { AppChrome } from "@/components/posture-coach/app-chrome";
import { useStretchAudio } from "@/components/posture-coach/hooks/use-stretch-audio";
import { useHistoryRecords } from "@/components/posture-coach/hooks/use-history-records";
import { useAnalysisSettings } from "@/components/posture-coach/hooks/use-analysis-settings";
import { useAuthSession } from "@/components/posture-coach/hooks/use-auth-session";
import { useAnalysisRuntime } from "@/components/posture-coach/hooks/use-analysis-runtime";
import { usePostureScreenEffect } from "@/components/posture-coach/hooks/use-posture-screen-effect";
import { createHomePostureSummary, createHomeScoreInsight } from "@/components/posture-coach/home-utils";
import { getHomeScoreTone, getStatusFromScore } from "@/components/posture-coach/display-utils";
import { getKoreaDateKey, getMonthKey, getScoreToneClass, shiftMonthKey } from "@/components/posture-coach/history-utils";
import { createGrowthPostureWeek } from "@/components/posture-coach/growth-posture-utils";


export function PostureCoachApp() {
  const {
    authPage,
    authUser,
    isAuthReady,
    isGoogleLoading,
    authMessage,
    storageText,
    storageTone,
    setAuthPage,
    setAuthMessage,
    handleGoogleLogin,
  } = useAuthSession();

  const {
    settings,
    settingsDraft,
    badPostureDurationMinutesInput,
    settingsSaveStatus,
    activeAnalysisSettingsPanel,
    isAnalysisSettingsOpen,
    setBadPostureDurationMinutesInput,
    setSettingsSaveStatus,
    setActiveAnalysisSettingsPanel,
    setIsAnalysisSettingsOpen,
    updateSettingsDraft,
    applySettings: handleApplySettings,
    resetSettings: handleResetSettings,
    requestNotificationPermission: handleRequestNotificationPermission,
  } = useAnalysisSettings(authUser?.uid ?? null);
  const [appMode, setAppMode] = useState<AppMode>("paused");
  const {
    stretchBeepEnabled,
    stretchTtsEnabled,
    stretchTtsVoiceUri,
    isStretchSettingsOpen,
    stretchSettingsDraft,
    stretchSettingsSaveStatus,
    stretchTtsVoiceOptions,
    isStretchBeepSupported,
    isStretchTtsSupported,
    playStretchBeep,
    speakStretchCue,
    updateStretchBeepEnabled,
    updateStretchTtsEnabled,
    updateStretchTtsVoice,
    openStretchSettings,
    closeStretchSettings,
    updateStretchSettingsDraft,
    handleResetStretchSettings,
    handleApplyStretchSettings,
    resetStretchAudioEvents,
    setStretchTtsUserStarted,
  } = useStretchAudio(appMode === "stretching");
  const clearLiveScorePointsHandlerRef = useRef<() => void>(() => undefined);
  const clearLiveScorePointsProxy = useCallback(() => clearLiveScorePointsHandlerRef.current(), []);
  const {
    recentSummary,
    historyGroups,
    isLoadingHistory,
    todaySavedScorePoints,
    selectedHistoryGroup,
    visibleHistoryMonthKey,
    historySessionPage,
    selectedHistorySessionKey,
    expandedHistoryImageSessions,
    editingSessionTitleKey,
    sessionTitleDraft,
    savingSessionTitleKey,
    sessionTitleErrors,
    pendingTitleSession,
    pendingTitleDraft,
    pendingTitleSaving,
    pendingTitleError,
    isHistoryDeleteModalOpen,
    historyDeleteScope,
    historyDeleteStep,
    historyDeleteSessionKeys,
    isDeletingHistory,
    historyDeleteError,
    refreshHistory,
    openPendingTitle,
    saveHistoryTitle: handleSaveHistorySessionTitle,
    savePendingTitle: handleSavePendingSessionTitle,
    openDeleteForSession: openHistoryDeleteForSession,
    closeDelete: closeHistoryDeleteModal,
    deleteRecords: handleDeleteHistoryRecords,
    setSelectedHistoryDateKey,
    setVisibleHistoryMonthKey,
    setHistorySessionPage,
    setSelectedHistorySessionKey,
    setExpandedHistoryImageSessions,
    setEditingSessionTitleKey,
    setSessionTitleDraft,
    setSessionTitleErrors,
    setPendingTitleDraft,
    setHistoryDeleteScope,
    setHistoryDeleteStep,
    setHistoryDeleteSessionKeys,
    setHistoryDeleteError,
  } = useHistoryRecords(authUser?.uid ?? null, clearLiveScorePointsProxy);
  const runtime = useAnalysisRuntime({
    uid: authUser?.uid ?? null,
    settings,
    appMode,
    setAppMode,
    setAuthMessage,
    refreshHistory,
    openPendingTitle,
    playStretchBeep,
    speakStretchCue,
    resetStretchAudioEvents,
    setStretchTtsUserStarted,
  });
  const { activeTab, setActiveTab, isRunning, modeMessage, cameraText, cameraTone, alertMessage, startApp, stopApp, videoRef, canvasRef } = runtime;
  const {
    latestPosture, hasCurrentSessionPostureData, liveScorePoints, sessionAverageScore, clearLiveScorePoints,
  } = runtime.posture;
  const postureScreenEffect = usePostureScreenEffect({
    isRunning,
    isTracking: latestPosture.isTracking,
    neckAngleDegrees: latestPosture.metrics?.neckAngleDegrees ?? null,
    soundEnabled: settings.postureEffectSoundEnabled,
  });
  const {
    activeStretchId, showAllStretchOptions, isStretchDropdownOpen, activeStretchStepIndex,
    completedStretchSteps, isStretchCompleteModalOpen, stretchCalibrationStatus, stretchCalibrationMessage,
    stretchCoaching, selectedStretch, activeStretchStep, nextStretchStep, isSelectedStretchComplete,
    stretchAccuracyScore, isStretchingMode, handleStretchSelection, handleStartStretchingMode,
    handleStopStretchingMode, handleNextStretchStep, handleSelectStretchStep, handleClearStretchSelection,
    handleCloseStretchCompleteModal, handleReturnToAnalysisAfterStretch, handleDoAnotherStretch,
    setShowAllStretchOptions, setIsStretchDropdownOpen,
  } = runtime.stretch;
  clearLiveScorePointsHandlerRef.current = clearLiveScorePoints;

  const recommendedStretches = useMemo<StretchDefinition[]>(
    () => getRecommendedStretches(latestPosture.mainIssue),
    [latestPosture.mainIssue]
  );
  const allStretchOptions = useMemo<StretchDefinition[]>(
    () => getRecommendedStretches("balanced"),
    []
  );
  const recentHistorySessions = useMemo(
    () => historyGroups.flatMap((group) => group.sessions).slice(0, 30),
    [historyGroups]
  );
  const homeScoreInsight = useMemo(
    () => createHomeScoreInsight(historyGroups, recentSummary),
    [historyGroups, recentSummary]
  );
  const homePostureSummary = useMemo(
    () => createHomePostureSummary(homeScoreInsight),
    [homeScoreInsight]
  );
  const growthPostureWeek = useMemo(
    () => createGrowthPostureWeek(historyGroups),
    [historyGroups]
  );
  const homeAttentionTone = getHomeScoreTone(
    homePostureSummary.attentionText === "없음" ? 100 : homeScoreInsight.weakestAreaScore
  );
  const combinedScorePoints = useMemo(
    () =>
      [...todaySavedScorePoints, ...liveScorePoints]
        .filter((point) => Number.isFinite(point.timestamp))
        .sort((left, right) => left.timestamp - right.timestamp),
    [todaySavedScorePoints, liveScorePoints]
  );
  const recommendationHistorySessions = useMemo(
    () => (hasCurrentSessionPostureData ? recentHistorySessions : []),
    [hasCurrentSessionPostureData, recentHistorySessions]
  );
  const personalizedStretchRecommendations = useMemo(
    () =>
      calculateStretchRecommendations({
        currentPosture: latestPosture,
        recentSessions: recommendationHistorySessions,
      }),
    [latestPosture, recommendationHistorySessions]
  );
  const displayedRecommendedStretches = useMemo<StretchDefinition[]>(() => {
    const personalized = personalizedStretchRecommendations.recommendations
      .map((recommendation) => getStretchById(recommendation.stretchId))
      .filter((stretch): stretch is StretchDefinition => Boolean(stretch));
    return personalized.length > 0 ? personalized : recommendedStretches;
  }, [personalizedStretchRecommendations, recommendedStretches]);
  const hasPersonalizedStretchChoices =
    hasCurrentSessionPostureData && personalizedStretchRecommendations.recommendations.length > 0;
  const stretchAccuracyTone = getScoreToneClass(stretchAccuracyScore);
  const modeLabel =
    appMode === "posture"
      ? "자세 분석 중"
      : appMode === "stretching"
        ? "스트레칭 중"
        : "자세 분석 일시중지";
  const postureStatus = getStatusFromScore(latestPosture.score);
  const currentLoad = latestPosture.metrics?.estimatedNeckLoadKg ?? null;


  const handleLogout = useCallback(async () => {
    if (isRunning) {
      await stopApp();
    }
    await signOutUser();
    setActiveTab("home");
  }, [isRunning, stopApp]);

  const handleStartAnalysis = useCallback(async () => {
    await postureScreenEffect.unlockAudio();
    await startApp();
  }, [postureScreenEffect.unlockAudio, startApp]);

  useEffect(() => {
    setSettingsSaveStatus("idle");
    void refreshHistory(authUser?.uid ?? null);
  }, [authUser, refreshHistory, setSettingsSaveStatus]);

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthScreen
        authPage={authPage}
        setAuthPage={setAuthPage}
        onGoogleLogin={handleGoogleLogin}
        authMessage={authMessage}
        isGoogleLoading={isGoogleLoading}
      />
    );
  }

  return (
    <>
      <PostureCoachDialogs
        activeAnalysisSettingsPanel={activeAnalysisSettingsPanel}
        badPostureDurationMinutesInput={badPostureDurationMinutesInput}
        historyDeleteError={historyDeleteError}
        historyDeleteScope={historyDeleteScope}
        historyDeleteSessionKeys={historyDeleteSessionKeys}
        historyDeleteStep={historyDeleteStep}
        isAnalysisSettingsOpen={isAnalysisSettingsOpen}
        isDeletingHistory={isDeletingHistory}
        isHistoryDeleteModalOpen={isHistoryDeleteModalOpen}
        isStretchBeepSupported={isStretchBeepSupported}
        isStretchCompleteModalOpen={isStretchCompleteModalOpen}
        isStretchSettingsOpen={isStretchSettingsOpen}
        isStretchTtsSupported={isStretchTtsSupported}
        pendingTitleDraft={pendingTitleDraft}
        pendingTitleError={pendingTitleError}
        pendingTitleSaving={pendingTitleSaving}
        pendingTitleSession={pendingTitleSession}
        selectedHistoryGroup={selectedHistoryGroup}
        selectedHistorySessionKey={selectedHistorySessionKey}
        settingsDraft={settingsDraft}
        settingsSaveStatus={settingsSaveStatus}
        stretchSettingsDraft={stretchSettingsDraft}
        stretchSettingsSaveStatus={stretchSettingsSaveStatus}
        stretchTtsVoiceOptions={stretchTtsVoiceOptions}
        onAnalysisPanelChange={setActiveAnalysisSettingsPanel}
        onBadPostureDurationChange={setBadPostureDurationMinutesInput}
        onHistoryDeleteErrorChange={setHistoryDeleteError}
        onHistoryDeleteScopeChange={setHistoryDeleteScope}
        onHistoryDeleteSessionKeysChange={setHistoryDeleteSessionKeys}
        onHistoryDeleteStepChange={setHistoryDeleteStep}
        onAnalysisSettingsOpenChange={setIsAnalysisSettingsOpen}
        onPendingTitleDraftChange={setPendingTitleDraft}
        onSettingsSaveStatusChange={setSettingsSaveStatus}
        onCloseHistoryDelete={closeHistoryDeleteModal}
        onCloseStretchSettings={closeStretchSettings}
        onUpdateSettingsDraft={updateSettingsDraft}
        onUpdateStretchSettingsDraft={updateStretchSettingsDraft}
        onApplySettings={handleApplySettings}
        onApplyStretchSettings={handleApplyStretchSettings}
        onCloseStretchComplete={handleCloseStretchCompleteModal}
        onDeleteHistoryRecords={handleDeleteHistoryRecords}
        onDoAnotherStretch={handleDoAnotherStretch}
        onRequestNotificationPermission={handleRequestNotificationPermission}
        onResetSettings={handleResetSettings}
        onResetStretchSettings={handleResetStretchSettings}
        onReturnToAnalysis={handleReturnToAnalysisAfterStretch}
        onSavePendingTitle={handleSavePendingSessionTitle}
      />

      <AppChrome
        activeTab={activeTab}
        alertMessage={alertMessage}
        authUser={authUser}
        cameraText={cameraText}
        cameraTone={cameraTone}
        storageText={storageText}
        storageTone={storageTone}
        onLogout={handleLogout}
        onTabChange={setActiveTab}
      >
        {activeTab === "home" && (
          <HomeView
            settings={settings}
            homePostureSummary={homePostureSummary}
            homeAttentionTone={homeAttentionTone}
            homeScoreInsight={homeScoreInsight}
            recentSummary={recentSummary}
            combinedScorePoints={combinedScorePoints}
            growthPostureWeek={growthPostureWeek}
            isLoadingHistory={isLoadingHistory}
            onOpenGrowthSettings={() => {
              setActiveAnalysisSettingsPanel("analysis-options");
              setIsAnalysisSettingsOpen(true);
            }}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === "analysis" && (
          <AnalysisView
            cameraTone={cameraTone}
            cameraText={cameraText}
            modeLabel={modeLabel}
            modeMessage={modeMessage}
            latestPosture={latestPosture}
            settings={settings}
            videoRef={videoRef}
            canvasRef={canvasRef}
            isRunning={isRunning}
            postureStatus={postureStatus}
            appMode={appMode}
            screenEffectLevel={postureScreenEffect.level}
            sessionAverageScore={sessionAverageScore}
            onOpenSettings={() => setIsAnalysisSettingsOpen(true)}
            onStart={handleStartAnalysis}
            onStop={stopApp}
          />
        )}
        {activeTab === "stretching" && (
          <StretchingView
            activeStretchId={activeStretchId}
            activeStretchStep={activeStretchStep}
            activeStretchStepIndex={activeStretchStepIndex}
            allStretchOptions={allStretchOptions}
            canvasRef={canvasRef}
            completedStretchSteps={completedStretchSteps}
            displayedRecommendedStretches={displayedRecommendedStretches}
            hasCurrentSessionPostureData={hasCurrentSessionPostureData}
            hasPersonalizedStretchChoices={hasPersonalizedStretchChoices}
            isLoadingHistory={isLoadingHistory}
            isRunning={isRunning}
            isSelectedStretchComplete={isSelectedStretchComplete}
            isStretchBeepSupported={isStretchBeepSupported}
            isStretchDropdownOpen={isStretchDropdownOpen}
            isStretchingMode={isStretchingMode}
            isStretchTtsSupported={isStretchTtsSupported}
            nextStretchStep={nextStretchStep}
            personalizedStretchRecommendations={personalizedStretchRecommendations}
            selectedStretch={selectedStretch}
            showAllStretchOptions={showAllStretchOptions}
            stretchAccuracyScore={stretchAccuracyScore}
            stretchAccuracyTone={stretchAccuracyTone}
            stretchBeepEnabled={stretchBeepEnabled}
            stretchCoaching={stretchCoaching}
            stretchTtsEnabled={stretchTtsEnabled}
            stretchTtsVoiceOptions={stretchTtsVoiceOptions}
            stretchTtsVoiceUri={stretchTtsVoiceUri}
            videoRef={videoRef}
            onClearSelection={handleClearStretchSelection}
            onCloseDropdown={() => setIsStretchDropdownOpen(false)}
            onNavigate={setActiveTab}
            onNextStep={handleNextStretchStep}
            onOpenSettings={openStretchSettings}
            onSelectStep={handleSelectStretchStep}
            onSelectStretch={handleStretchSelection}
            onStart={handleStartStretchingMode}
            onStop={handleStopStretchingMode}
            onToggleBeep={updateStretchBeepEnabled}
            onToggleDropdown={() => setIsStretchDropdownOpen((current) => !current)}
            onToggleShowAll={() => setShowAllStretchOptions((current) => !current)}
            onToggleTts={updateStretchTtsEnabled}
            onVoiceChange={updateStretchTtsVoice}
          />
        )}
        {activeTab === "history" && (
          <HistoryView
            historyGroups={historyGroups}
            growthPostureWeek={growthPostureWeek}
            isLoadingHistory={isLoadingHistory}
            selectedHistoryGroup={selectedHistoryGroup}
            selectedHistorySessionKey={selectedHistorySessionKey}
            historySessionPage={historySessionPage}
            visibleHistoryMonthKey={visibleHistoryMonthKey}
            editingSessionTitleKey={editingSessionTitleKey}
            sessionTitleDraft={sessionTitleDraft}
            savingSessionTitleKey={savingSessionTitleKey}
            sessionTitleErrors={sessionTitleErrors}
            expandedHistoryImageSessions={expandedHistoryImageSessions}
            onSelectSession={(sessionTitleKey, index, pageSize) => {
              setHistorySessionPage(Math.floor(index / pageSize));
              setSelectedHistorySessionKey(sessionTitleKey);
            }}
            onOpenDeleteSession={openHistoryDeleteForSession}
            onShiftMonth={(offset) =>
              setVisibleHistoryMonthKey((current) => {
                const next = shiftMonthKey(current, offset);
                return offset > 0 && next > getMonthKey(getKoreaDateKey()) ? getMonthKey(getKoreaDateKey()) : next;
              })
            }
            onSelectDate={(dateKey) => {
              setSelectedHistoryDateKey(dateKey);
              setVisibleHistoryMonthKey(getMonthKey(dateKey));
              setHistorySessionPage(0);
              setSelectedHistorySessionKey(null);
            }}
            onCloseSession={() => setSelectedHistorySessionKey(null)}
            onChangePage={(offset) => setHistorySessionPage((current) => Math.max(0, current + offset))}
            onTitleDraftChange={setSessionTitleDraft}
            onCancelTitleEdit={() => {
              setEditingSessionTitleKey(null);
              setSessionTitleDraft("");
            }}
            onBeginTitleEdit={(sessionTitleKey, title) => {
              setEditingSessionTitleKey(sessionTitleKey);
              setSessionTitleDraft(title);
              setSessionTitleErrors((current) => {
                const next = { ...current };
                delete next[sessionTitleKey];
                return next;
              });
            }}
            onToggleImages={(sessionId) =>
              setExpandedHistoryImageSessions((current) => {
                const next = new Set(current);
                if (next.has(sessionId)) {
                  next.delete(sessionId);
                } else {
                  next.add(sessionId);
                }
                return next;
              })
            }
            onSaveTitle={handleSaveHistorySessionTitle}
          />
        )}
      </AppChrome>
    </>
  );
}
