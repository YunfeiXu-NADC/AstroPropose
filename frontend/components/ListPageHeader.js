export default function ListPageHeader({ title, action }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pt-5 sm:pt-7">
      <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
        <span aria-hidden="true" className="h-7 w-1 shrink-0 rounded-full bg-[#3347b8]" />
        {title}
      </h1>
      {action}
    </header>
  );
}
