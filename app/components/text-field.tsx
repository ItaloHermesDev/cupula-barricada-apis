const fieldClass =
  "mt-2 w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-foreground outline-none ring-accent/15 placeholder:text-muted focus:border-accent focus:ring-4";

export function TextField({
  id,
  name,
  label,
  type,
  autoComplete,
  error,
  maxLength,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  error?: string;
  maxLength: number;
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={fieldClass}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm text-[#ffb3c0]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const submitClass =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export const alertClass =
  "rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-[#ffb3c0]";

export const successClass =
  "rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success";
