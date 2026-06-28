import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  );

  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full cursor-pointer touch-none select-none items-center data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-disabled:cursor-not-allowed data-vertical:flex-col data-disabled:opacity-50",
        className
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      max={max}
      min={min}
      value={value}
      {...props}
    >
      <SliderPrimitive.Track
        className="relative grow overflow-hidden rounded-md bg-foreground/10 data-horizontal:h-1 data-vertical:h-full data-horizontal:w-full data-vertical:w-1"
        data-slot="slider-track"
      >
        <SliderPrimitive.Range
          className="absolute select-none bg-foreground data-horizontal:h-full data-vertical:w-full"
          data-slot="slider-range"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          className="relative block size-3 shrink-0 select-none rounded-md border border-foreground/20 bg-background transition-colors after:absolute after:-inset-2 hover:ring-1 hover:ring-ring focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring active:ring-1 disabled:pointer-events-none disabled:opacity-50"
          data-slot="slider-thumb"
          key={index}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
