export default function ListPageToolbar({ filters, children }) {
  return (
    <section className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between" aria-label="列表筛选与搜索">
      {filters}
      <div className="ml-auto flex w-full flex-wrap items-center gap-3 xl:w-auto xl:justify-end">
        {children}
      </div>
    </section>
  );
}
