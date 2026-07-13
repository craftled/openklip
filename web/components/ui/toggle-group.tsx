"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type ToggleGroupValue = string | readonly string[];

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    disabled?: boolean;
    orientation?: "horizontal" | "vertical";
    onItemPressed?: (value: string, pressed: boolean) => void;
    selectedValues: readonly string[];
    spacing?: number;
  }
>({
  orientation: "horizontal",
  selectedValues: [],
  size: "default",
  spacing: 2,
  variant: "default",
});

const normalizeValue = (value?: ToggleGroupValue): readonly string[] => {
  if (typeof value === "string") {
    return value ? [value] : [];
  }
  return value ?? [];
};

export const getNextToggleGroupValues = ({
  isMultiple,
  itemValue,
  pressed,
  selectedValues,
}: {
  isMultiple: boolean;
  itemValue: string;
  pressed: boolean;
  selectedValues: readonly string[];
}): readonly string[] => {
  if (isMultiple) {
    if (pressed) {
      return selectedValues.includes(itemValue)
        ? selectedValues
        : [...selectedValues, itemValue];
    }
    return selectedValues.filter(
      (selectedValue) => selectedValue !== itemValue
    );
  }
  if (!pressed) {
    return selectedValues;
  }
  return [itemValue];
};

function ToggleGroup({
  children,
  className,
  defaultValue,
  disabled = false,
  onValueChange,
  orientation = "horizontal",
  role = "group",
  size,
  spacing = 2,
  style,
  type,
  value,
  variant,
  ...props
}: Omit<React.ComponentProps<"div">, "defaultValue" | "onChange"> &
  VariantProps<typeof toggleVariants> & {
    defaultValue?: ToggleGroupValue;
    disabled?: boolean;
    onValueChange?: (value: ToggleGroupValue) => void;
    orientation?: "horizontal" | "vertical";
    spacing?: number;
    type?: "multiple" | "single";
    value?: ToggleGroupValue;
  }) {
  const isMultiple = type === "multiple";
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(() =>
    normalizeValue(defaultValue)
  );
  const selectedValues = isControlled ? normalizeValue(value) : internalValue;

  const setSelectedValues = React.useCallback(
    (nextValues: readonly string[]) => {
      if (!isControlled) {
        setInternalValue(nextValues);
      }
      onValueChange?.(isMultiple ? nextValues : (nextValues[0] ?? ""));
    },
    [isControlled, isMultiple, onValueChange]
  );

  const onItemPressed = React.useCallback(
    (itemValue: string, pressed: boolean) => {
      const nextValues = getNextToggleGroupValues({
        isMultiple,
        itemValue,
        pressed,
        selectedValues,
      });
      if (nextValues === selectedValues) {
        return;
      }
      setSelectedValues(nextValues);
    },
    [isMultiple, selectedValues, setSelectedValues]
  );

  return (
    <ToggleGroupContext.Provider
      value={{
        disabled,
        onItemPressed,
        orientation,
        selectedValues,
        size,
        spacing,
        variant,
      }}
    >
      <div
        aria-disabled={disabled || undefined}
        className={cn(
          "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-vertical:flex-col data-vertical:items-stretch data-[size=sm]:rounded-[min(var(--radius-md),10px)]",
          className
        )}
        data-horizontal={orientation === "horizontal" ? "" : undefined}
        data-orientation={orientation}
        data-size={size}
        data-slot="toggle-group"
        data-spacing={spacing}
        data-variant={variant}
        data-vertical={orientation === "vertical" ? "" : undefined}
        role={role}
        style={
          {
            ...style,
            "--gap": spacing,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

function ToggleGroupItem({
  className,
  children,
  "data-cuelume-disable": cuelumeDisable,
  disabled,
  onPressedChange,
  pressed,
  size = "default",
  value,
  variant = "default",
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    "data-cuelume-disable"?: boolean;
  }) {
  const context = React.useContext(ToggleGroupContext);
  const isGroupedItem = typeof value === "string";
  const itemDisabled = disabled || context.disabled;

  return (
    <TogglePrimitive
      className={cn(
        "shrink-0 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:rounded-none group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-[spacing=0]/toggle-group:px-2 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      data-cuelume-toggle={cuelumeDisable ? undefined : ""}
      data-size={context.size || size}
      data-slot="toggle-group-item"
      data-spacing={context.spacing}
      data-variant={context.variant || variant}
      disabled={itemDisabled}
      onPressedChange={(nextPressed, details) => {
        onPressedChange?.(nextPressed, details);
        if (details.isCanceled || itemDisabled || !isGroupedItem) {
          return;
        }
        context.onItemPressed?.(value, nextPressed);
      }}
      pressed={isGroupedItem ? context.selectedValues.includes(value) : pressed}
      value={value}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
