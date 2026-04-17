'use client';

interface ProgressBarProps {
  value: number;
  total: number;
  className?: string;
}

export function ProgressBar({ value, total, className = '' }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>
          {value.toLocaleString()} / {total.toLocaleString()}
        </span>
        <span>{pct}%</span>
      </div>
      <div
        className="w-full h-2 bg-gray-200 rounded overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
