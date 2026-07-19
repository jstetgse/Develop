export function calculateSessionAverage(totalScore: number, scoreCount: number) {
  return scoreCount > 0 ? Math.round(totalScore / scoreCount) : null;
}

