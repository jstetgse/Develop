import { useRef, useState } from "react";

export function useStretchProgress() {
  const [activeStretchId, setActiveStretchId] = useState<string | null>(null);
  const [showAllStretchOptions, setShowAllStretchOptions] = useState(false);
  const [isStretchDropdownOpen, setIsStretchDropdownOpen] = useState(false);
  const [activeStretchStepIndex, setActiveStretchStepIndex] = useState(0);
  const [completedStretchSteps, setCompletedStretchSteps] = useState<number[]>([]);
  const [isStretchCompleteModalOpen, setIsStretchCompleteModalOpen] = useState(false);
  const activeStretchIdRef = useRef<string | null>(null);
  const activeStretchStepIndexRef = useRef(0);
  const completedStretchStepsRef = useRef<Set<number>>(new Set());

  return {
    activeStretchId, setActiveStretchId, showAllStretchOptions, setShowAllStretchOptions,
    isStretchDropdownOpen, setIsStretchDropdownOpen, activeStretchStepIndex, setActiveStretchStepIndex,
    completedStretchSteps, setCompletedStretchSteps, isStretchCompleteModalOpen, setIsStretchCompleteModalOpen,
    activeStretchIdRef, activeStretchStepIndexRef, completedStretchStepsRef,
  };
}
