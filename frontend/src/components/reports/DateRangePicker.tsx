'use client';

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-gray-600">
        From
        <input
          type="date"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
          className="ml-2 border rounded px-2 py-1 text-sm"
          data-testid="date-from"
        />
      </label>
      <label className="text-sm text-gray-600">
        To
        <input
          type="date"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
          className="ml-2 border rounded px-2 py-1 text-sm"
          data-testid="date-to"
        />
      </label>
    </div>
  );
}
