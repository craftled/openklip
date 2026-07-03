"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearElevenLabsApiKey,
  type ElevenLabsDetails,
  fetchElevenLabsDetails,
  fetchIntegrationsStatus,
  type IntegrationsStatus,
  type IntegrationTestStatus,
  saveElevenLabsApiKey,
  testElevenLabsApiKey,
} from "@/lib/integrations-client";

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat().format(value);
}

function formatResetDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <span className="text-[10px] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-[12px] text-foreground">{value}</span>
    </div>
  );
}

export function SettingsIntegrationsPanel() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [details, setDetails] = useState<ElevenLabsDetails | null>(null);
  const [status, setStatus] = useState<IntegrationsStatus>({
    elevenLabs: { hasApiKey: false, keyPreview: null, updatedAt: null },
  });
  const [testStatus, setTestStatus] = useState<
    IntegrationTestStatus["elevenLabs"] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchIntegrationsStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedApiKey = apiKey.trim();
  const updatedAt = useMemo(
    () => formatUpdatedAt(status.elevenLabs.updatedAt),
    [status.elevenLabs.updatedAt]
  );
  const usage =
    details?.characterCount === null && details.characterLimit === null
      ? "—"
      : `${formatNumber(details?.characterCount ?? null)} / ${formatNumber(
          details?.characterLimit ?? null
        )}`;
  const voices =
    details?.voiceSlotsUsed === null && details.voiceLimit === null
      ? formatNumber(details?.voiceCount ?? null)
      : `${formatNumber(details?.voiceSlotsUsed ?? null)} / ${formatNumber(
          details?.voiceLimit ?? null
        )}`;

  const onSave = async () => {
    if (!trimmedApiKey) {
      return;
    }
    setError(null);
    setTestStatus(null);
    setIsSaving(true);
    try {
      const next = await saveElevenLabsApiKey(trimmedApiKey);
      setStatus(next);
      setApiKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const onClear = async () => {
    setError(null);
    setTestStatus(null);
    setIsSaving(true);
    try {
      const next = await clearElevenLabsApiKey();
      setStatus(next);
      setDetails(null);
      setApiKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const onTest = async () => {
    setError(null);
    setTestStatus(null);
    setIsTesting(true);
    try {
      const next = await testElevenLabsApiKey(trimmedApiKey || undefined);
      setTestStatus(next.elevenLabs);
      if (next.elevenLabs.ok && !trimmedApiKey) {
        setDetails(await fetchElevenLabsDetails());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsTesting(false);
    }
  };

  const onRefreshDetails = async () => {
    setError(null);
    setIsLoadingDetails(true);
    try {
      setDetails(await fetchElevenLabsDetails());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <SettingsSection title="Voice">
      <SettingsRow
        description="Paste an ElevenLabs API key for voice features."
        title={
          <span className="flex items-center gap-2">
            <span>ElevenLabs</span>
            <Badge
              className={
                status.elevenLabs.hasApiKey
                  ? "h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                  : "h-4 px-1.5 text-[10px]"
              }
              variant={status.elevenLabs.hasApiKey ? "outline" : "secondary"}
            >
              {isLoading
                ? "Checking"
                : status.elevenLabs.hasApiKey
                  ? "Connected"
                  : "Not connected"}
            </Badge>
          </span>
        }
      >
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              autoComplete="off"
              className="h-8 text-sm"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                status.elevenLabs.keyPreview
                  ? `Saved ${status.elevenLabs.keyPreview} · enter a new key to replace`
                  : "Paste xi-api-key"
              }
              type="password"
              value={apiKey}
            />
            <div className="flex shrink-0 gap-2">
              <Button
                disabled={!trimmedApiKey || isSaving || isTesting}
                onClick={onSave}
                size="sm"
                type="button"
                variant={trimmedApiKey ? "default" : "outline"}
              >
                {isSaving ? "Saving" : "Save"}
              </Button>
              <Button
                disabled={
                  isSaving ||
                  isTesting ||
                  !(trimmedApiKey || status.elevenLabs.hasApiKey)
                }
                onClick={onTest}
                size="sm"
                type="button"
                variant="outline"
              >
                {isTesting ? "Testing" : "Test"}
              </Button>
              <Button
                disabled={!status.elevenLabs.hasApiKey || isSaving || isTesting}
                onClick={onClear}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear
              </Button>
              <Button
                disabled={
                  !status.elevenLabs.hasApiKey ||
                  isSaving ||
                  isTesting ||
                  isLoadingDetails
                }
                onClick={onRefreshDetails}
                size="sm"
                type="button"
                variant="outline"
              >
                {isLoadingDetails ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </div>
          {details ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <DetailItem
                label="Plan"
                value={details.tier ?? details.status ?? "—"}
              />
              <DetailItem label="Characters" value={usage} />
              <DetailItem label="Voices" value={voices} />
              <DetailItem
                label="Models"
                value={formatNumber(details.modelCount)}
              />
              <DetailItem
                label="Reset"
                value={formatResetDate(details.characterResetAt)}
              />
            </div>
          ) : null}
          {details?.voices.length ? (
            <p className="text-[12px] text-muted-foreground">
              Voices: {details.voices.join(", ")}
            </p>
          ) : null}
          {testStatus || updatedAt || error ? (
            <p
              className={
                error || testStatus?.ok === false
                  ? "text-[12px] text-destructive"
                  : testStatus?.ok
                    ? "text-[12px] text-emerald-700 dark:text-emerald-300"
                    : "text-[12px] text-muted-foreground"
              }
            >
              {error ?? testStatus?.message ?? updatedAt}
            </p>
          ) : null}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
