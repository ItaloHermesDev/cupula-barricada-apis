import { NAV_PAGES } from "@/lib/pages";

export function PageCheckboxes({
  idPrefix,
  selected,
}: {
  idPrefix: string;
  selected?: readonly string[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">Páginas visíveis</legend>
      <div className="mt-3 flex flex-col gap-2">
        {NAV_PAGES.map((page) => {
          const checked = selected ? selected.includes(page.key) : page.key !== "usuarios";

          return (
            <label
              key={page.key}
              htmlFor={`${idPrefix}-${page.key}`}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-background px-3 py-2.5"
            >
              <input
                id={`${idPrefix}-${page.key}`}
                name="pages"
                type="checkbox"
                value={page.key}
                defaultChecked={checked}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{page.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">{page.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
