import type { ReactNode } from "react";

export function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "orange";
}) {
  const toneClass =
    tone === "green"
      ? "bg-[#C4F6E8] text-[#18755B]"
      : tone === "orange"
        ? "bg-[#FDECC8] text-orange-700"
        : "bg-[#9BE7D1] text-[#12644C]";

  return (
    <div className="app-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center ${toneClass}`}>{icon}</div>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  );
}



