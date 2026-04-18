import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SliderInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}

export function SliderInput({
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
  prefix,
  suffix,
  ariaLabel,
  className,
  inputClassName,
}: SliderInputProps) {
  const numValue = Number.isFinite(value) ? value : 0;
  const sliderValue = Math.min(max, Math.max(min, numValue));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Slider
        value={[sliderValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        aria-label={ariaLabel}
        className="flex-1"
      />
      <div className="relative w-28 flex-shrink-0">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={numValue === 0 ? "" : numValue}
          placeholder="0"
          onChange={(e) => {
            const n = e.target.value === "" ? 0 : Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className={cn(
            "h-9 text-right tabular-nums",
            prefix && "pl-6",
            suffix && "pr-8",
            inputClassName
          )}
        />
        {suffix && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
