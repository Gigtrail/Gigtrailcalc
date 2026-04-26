import { useEffect, useState } from "react";
import {
  useCompleteRun,
  getGetRunQueryKey,
  getGetRunsQueryKey,
  type Run,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

type Step = "ask" | "actuals";

type ActualsState = {
  actualAttendance: string;
  actualTicketSales: string;
  actualMerch: string;
  actualIncome: string;
  actualExpenses: string;
  accommodationProvided: boolean | null;
  riderProvided: boolean | null;
  wouldDoAgain: "yes" | "no" | "unsure" | "";
  notes: string;
};

const EMPTY_ACTUALS: ActualsState = {
  actualAttendance: "",
  actualTicketSales: "",
  actualMerch: "",
  actualIncome: "",
  actualExpenses: "",
  accommodationProvided: null,
  riderProvided: null,
  wouldDoAgain: "",
  notes: "",
};

function fromRun(run: Run | null | undefined): ActualsState {
  if (!run) return EMPTY_ACTUALS;
  const numToStr = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    actualAttendance: numToStr(run.actualAttendance),
    actualTicketSales: numToStr((run as Run & { actualTicketSales?: number | null }).actualTicketSales),
    actualMerch: numToStr(run.actualOtherIncome),
    actualIncome: numToStr((run as Run & { actualIncome?: number | null }).actualIncome ?? run.actualTicketIncome),
    actualExpenses: numToStr(run.actualExpenses),
    accommodationProvided:
      (run as Run & { accommodationProvided?: boolean | null }).accommodationProvided ?? null,
    riderProvided: (run as Run & { riderProvided?: boolean | null }).riderProvided ?? null,
    wouldDoAgain:
      run.wouldDoAgain === "yes" || run.wouldDoAgain === "no" || run.wouldDoAgain === "unsure"
        ? run.wouldDoAgain
        : "",
    notes: run.notes ?? "",
  };
}

function toNullableNumber(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function toNullableInt(v: string): number | null {
  const num = toNullableNumber(v);
  return num == null ? null : Math.round(num);
}

interface Props {
  runId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog opens directly on the actuals form, pre-filled. */
  initialMode?: "ask" | "edit";
  /** Existing run record so we can pre-fill actuals when editing. */
  existingRun?: Run | null;
}

export function ShowCompletionDialog({
  runId,
  open,
  onOpenChange,
  initialMode = "ask",
  existingRun,
}: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const completeRun = useCompleteRun();

  const [step, setStep] = useState<Step>(initialMode === "edit" ? "actuals" : "ask");
  const [actuals, setActuals] = useState<ActualsState>(() => fromRun(existingRun ?? null));

  // Reset state whenever the dialog re-opens so editing always starts from the latest data.
  useEffect(() => {
    if (open) {
      setStep(initialMode === "edit" ? "actuals" : "ask");
      setActuals(fromRun(existingRun ?? null));
    }
  }, [open, initialMode, existingRun]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(runId) });
    queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() });
  };

  const submitCancelled = async () => {
    try {
      await completeRun.mutateAsync({ id: runId, data: { cancelled: true } });
      toast({ title: "Show marked as cancelled" });
      invalidate();
      onOpenChange(false);
    } catch (err) {
      console.error("[ShowCompletion] cancel failed", err);
      toast({ title: "Couldn't save — please try again", variant: "destructive" });
    }
  };

  const submitActuals = async () => {
    try {
      await completeRun.mutateAsync({
        id: runId,
        data: {
          cancelled: false,
          actualAttendance: toNullableInt(actuals.actualAttendance),
          actualTicketSales: toNullableInt(actuals.actualTicketSales),
          actualMerch: toNullableNumber(actuals.actualMerch),
          actualIncome: toNullableNumber(actuals.actualIncome),
          actualExpenses: toNullableNumber(actuals.actualExpenses),
          accommodationProvided: actuals.accommodationProvided,
          riderProvided: actuals.riderProvided,
          wouldDoAgain: actuals.wouldDoAgain === "" ? null : actuals.wouldDoAgain,
          notes: actuals.notes.trim() === "" ? null : actuals.notes.trim(),
        },
      });
      toast({ title: "Post-show actuals saved" });
      invalidate();
      onOpenChange(false);
    } catch (err) {
      console.error("[ShowCompletion] save failed", err);
      toast({ title: "Couldn't save — please try again", variant: "destructive" });
    }
  };

  const renderTriState = (
    value: boolean | null,
    onChange: (next: boolean | null) => void,
    name: string,
  ) => (
    <div className="flex gap-2" role="group" aria-label={name}>
      <Button
        type="button"
        size="sm"
        variant={value === true ? "default" : "outline"}
        onClick={() => onChange(value === true ? null : true)}
        data-testid={`button-${name}-yes`}
      >
        Yes
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === false ? "default" : "outline"}
        onClick={() => onChange(value === false ? null : false)}
        data-testid={`button-${name}-no`}
      >
        No
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="dialog-mark-complete"
      >
        {step === "ask" ? (
          <>
            <DialogHeader>
              <DialogTitle>Did this show go ahead?</DialogTitle>
              <DialogDescription>
                Tell us how it went so we can save the actuals for this past show.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              <Button
                type="button"
                onClick={() => setStep("actuals")}
                data-testid="button-completion-yes"
              >
                Yes — enter what really happened
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={submitCancelled}
                disabled={completeRun.isPending}
                data-testid="button-completion-no"
              >
                No — it was cancelled
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-completion-skip"
              >
                Skip for now
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Post-show actuals</DialogTitle>
              <DialogDescription>
                Optional — fill in whatever you have. We won't overwrite your projected numbers.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1">
                <Label htmlFor="actual-attendance">Actual attendance</Label>
                <Input
                  id="actual-attendance"
                  type="number"
                  inputMode="numeric"
                  value={actuals.actualAttendance}
                  onChange={(e) => setActuals((p) => ({ ...p, actualAttendance: e.target.value }))}
                  data-testid="input-actual-attendance"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="actual-ticket-sales">Actual ticket sales (count)</Label>
                <Input
                  id="actual-ticket-sales"
                  type="number"
                  inputMode="numeric"
                  value={actuals.actualTicketSales}
                  onChange={(e) =>
                    setActuals((p) => ({ ...p, actualTicketSales: e.target.value }))
                  }
                  data-testid="input-actual-ticket-sales"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="actual-merch">Merch sales ($)</Label>
                <Input
                  id="actual-merch"
                  type="number"
                  inputMode="decimal"
                  value={actuals.actualMerch}
                  onChange={(e) => setActuals((p) => ({ ...p, actualMerch: e.target.value }))}
                  data-testid="input-actual-merch"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="actual-income">Actual pay received ($)</Label>
                <Input
                  id="actual-income"
                  type="number"
                  inputMode="decimal"
                  value={actuals.actualIncome}
                  onChange={(e) => setActuals((p) => ({ ...p, actualIncome: e.target.value }))}
                  data-testid="input-actual-income"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="actual-expenses">Actual expenses ($, optional)</Label>
                <Input
                  id="actual-expenses"
                  type="number"
                  inputMode="decimal"
                  value={actuals.actualExpenses}
                  onChange={(e) => setActuals((p) => ({ ...p, actualExpenses: e.target.value }))}
                  data-testid="input-actual-expenses"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="m-0">Accommodation provided?</Label>
                {renderTriState(
                  actuals.accommodationProvided,
                  (next) => setActuals((p) => ({ ...p, accommodationProvided: next })),
                  "accommodation",
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="m-0">Rider provided?</Label>
                {renderTriState(
                  actuals.riderProvided,
                  (next) => setActuals((p) => ({ ...p, riderProvided: next })),
                  "rider",
                )}
              </div>
              <div className="grid gap-2">
                <Label>Would you play here again?</Label>
                <RadioGroup
                  value={actuals.wouldDoAgain}
                  onValueChange={(v) =>
                    setActuals((p) => ({
                      ...p,
                      wouldDoAgain: (v as "yes" | "no" | "unsure" | "") || "",
                    }))
                  }
                  className="flex gap-3"
                >
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="yes" id="wda-yes" data-testid="radio-wda-yes" />
                    <Label htmlFor="wda-yes" className="m-0 font-normal">Yes</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="no" id="wda-no" data-testid="radio-wda-no" />
                    <Label htmlFor="wda-no" className="m-0 font-normal">No</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="unsure" id="wda-unsure" data-testid="radio-wda-unsure" />
                    <Label htmlFor="wda-unsure" className="m-0 font-normal">Unsure</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="actuals-notes">Notes</Label>
                <Textarea
                  id="actuals-notes"
                  rows={3}
                  value={actuals.notes}
                  onChange={(e) => setActuals((p) => ({ ...p, notes: e.target.value }))}
                  data-testid="input-actuals-notes"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={completeRun.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitActuals}
                disabled={completeRun.isPending}
                data-testid="button-save-actuals"
              >
                {completeRun.isPending ? "Saving…" : "Save actuals"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

