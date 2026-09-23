import * as A from "@radix-ui/react-alert-dialog";
import { Button } from "./button";
export function ConfirmCancel({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-neutral-900/50" />
        <A.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-lg bg-surface p-4 shadow-lg">
          <A.Title className="text-xl font-medium">Cancel export?</A.Title>
          <A.Description className="text-sm text-text/85">
            The partial output will be removed and no path will be printed.
          </A.Description>
          <div className="mt-1.5 flex justify-end gap-1.5">
            <A.Cancel asChild>
              <Button>Keep exporting</Button>
            </A.Cancel>
            <A.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                Cancel export
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
