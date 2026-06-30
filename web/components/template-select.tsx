"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError } from "@/lib/app-toast";
import { APP_ICON_CLASS, LayoutTemplate } from "@/lib/icon";
import { saveProjectEdits } from "../../app/actions.ts";

export interface TemplateOption {
  description: string;
  id: string;
  label: string;
}

export function TemplateSelect({
  slug,
  template,
  onTemplateChange,
}: {
  slug: string;
  template?: string;
  onTemplateChange: (templateId: string) => void;
}) {
  const [options, setOptions] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/templates")
      .then((res) => res.json())
      .then((data: { templates?: TemplateOption[] }) => {
        if (!alive) {
          return;
        }
        setOptions(data.templates ?? []);
      })
      .catch(() => {
        if (alive) {
          setOptions([]);
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = template ?? options[0]?.id ?? "";

  const onValueChange = useCallback(
    async (next: string) => {
      setSaving(true);
      try {
        const res = await saveProjectEdits(slug, { template: next });
        if (!res.ok) {
          throw new Error(res.error);
        }
        onTemplateChange(next);
      } catch (e) {
        toastError("Could not set template", (e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [onTemplateChange, slug]
  );

  if (loading && options.length === 0) {
    return null;
  }
  if (options.length === 0) {
    return null;
  }

  const active = options.find((o) => o.id === value);

  return (
    <Select
      disabled={saving}
      onValueChange={(v) => {
        if (v) {
          void onValueChange(v);
        }
      }}
      value={value}
    >
      <SelectTrigger
        aria-label="Edit template"
        className="w-[min(100%,11rem)] gap-1.5 text-xs"
      >
        <LayoutTemplate className={APP_ICON_CLASS} />
        <SelectValue placeholder="Template">
          {active?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <div className="flex flex-col gap-0.5">
                <span>{opt.label}</span>
                {opt.description ? (
                  <span className="text-muted-foreground text-xs leading-snug">
                    {opt.description}
                  </span>
                ) : null}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
