import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function ListSearchField({ value, onChange, label = '搜索提案', placeholder = '搜索编号、名称、申请人或状态' }) {
  return (
    <label className="relative block min-w-[220px] flex-1 xl:w-80 xl:flex-none">
      <span className="sr-only">{label}</span>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="rps-field pl-9"
      />
    </label>
  );
}
