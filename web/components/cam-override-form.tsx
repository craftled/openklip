"use client";

import type { Cam } from "@engine/cams";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CamOverrideForm({
  cams,
  disabled,
  onSubmit,
}: {
  cams: Cam[];
  disabled?: boolean;
  onSubmit: (fromSec: number, toSec: number, shot: string) => void;
}) {
  const [fromSec, setFromSec] = useState("");
  const [toSec, setToSec] = useState("");
  const [shot, setShot] = useState(cams[0]?.id ?? "wide");

  const shots = [
    ...cams.map((cam) => ({ id: cam.id, label: cam.name || cam.id })),
    { id: "wide", label: "Wide" },
  ];

  return (
    <form
      className="flex flex-col gap-1.5 rounded-md border p-1.5"
      data-cam-override-form
      onSubmit={(event) => {
        event.preventDefault();
        const from = Number(fromSec);
        const to = Number(toSec);
        if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) {
          return;
        }
        if (!shot) {
          return;
        }
        onSubmit(from, to, shot);
      }}
    >
      <span className="font-medium text-xs">Lock shot span</span>
      <div className="grid grid-cols-3 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-muted-foreground">From (s)</span>
          <Input
            className="h-7 text-xs"
            data-cam-override-from
            disabled={disabled}
            inputMode="decimal"
            onChange={(e) => setFromSec(e.target.value)}
            placeholder="0.0"
            value={fromSec}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-muted-foreground">To (s)</span>
          <Input
            className="h-7 text-xs"
            data-cam-override-to
            disabled={disabled}
            inputMode="decimal"
            onChange={(e) => setToSec(e.target.value)}
            placeholder="2.0"
            value={toSec}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-muted-foreground">Shot</span>
          <Select
            disabled={disabled}
            onValueChange={(value) => {
              if (value) {
                setShot(value);
              }
            }}
            value={shot}
          >
            <SelectTrigger
              className="h-7! w-full rounded-md! px-2! py-0! text-[0.8rem]!"
              data-cam-override-shot
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {shots.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <Button
        data-cam-override-apply
        disabled={disabled}
        size="sm"
        type="submit"
        variant="outline"
      >
        Lock and re-mix
      </Button>
    </form>
  );
}
