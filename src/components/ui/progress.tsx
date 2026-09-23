import * as P from "@radix-ui/react-progress";
export function Progress({ value = 0 }: { value?: number }) {
  return (
    <P.Root
      value={value}
      className="relative h-1 w-full overflow-hidden rounded-xs bg-neutral-800"
      aria-label="Export progress"
    >
      <P.Indicator
        className="h-full rounded-xs bg-accent shadow-[0_0_12px_var(--color-accent)] transition-transform"
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </P.Root>
  );
}
