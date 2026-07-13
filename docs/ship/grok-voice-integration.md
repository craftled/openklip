# Ship Report: Grok Voice settings integration (PR #104)

## Target

- PR: https://github.com/craftled/openklip/pull/104
- **Status: MERGED** 2026-07-13
- Merge commit: `15f8c25` on `main`
- Docs follow-up: `v0.42.0.2` (this release)

## Summary

Settings → Integrations gained a **Grok Voice** row for xAI API keys, matching the existing ElevenLabs and Reve pattern. Keys persist locally; the browser never receives raw secrets.

## Data shape

Repo-local file (OpenKlip checkout cwd, not per project):

```json
{
  "elevenLabs": { "apiKey": "…", "updatedAt": "2026-07-13T…" },
  "reve": { "apiKey": "…", "updatedAt": "…" },
  "xai": { "apiKey": "…", "updatedAt": "…" }
}
```

Path: `.openklip/integrations.json` (mode `0600` on save).

Status returned to the client (`IntegrationStatus`):

```typescript
{
  elevenLabs: ProviderStatus;
  reve: ProviderStatus;
  xai: ProviderStatus;
}
// ProviderStatus: { hasApiKey, keyPreview, updatedAt }
```

xAI refresh details (`XaiVoiceDetails`):

```typescript
{
  apiKeyName: string | null;
  apiKeyBlocked: boolean | null;
  apiKeyDisabled: boolean | null;
  teamBlocked: boolean | null;
  builtinVoiceCount: number | null;
  customVoiceCount: number | null;
  customVoiceLimit: 30;
  voices: string[];       // e.g. "Eve (eve)"
  customVoices: string[];
}
```

## Files

| File | Role |
| --- | --- |
| `src/integrations-config.ts` | Load/save config, `setXaiApiKey`, `testXaiApiKey`, `fetchXaiVoiceDetails`, `readXaiApiKey` |
| `app/api/integrations/route.ts` | `GET` status, `PUT` save, `POST` test, `DELETE ?provider=xai` clear |
| `app/api/integrations/details/route.ts` | `GET ?provider=xai` details |
| `web/lib/integrations-client.ts` | Browser fetch helpers and types |
| `web/components/settings/settings-integrations-panel.tsx` | `XaiIntegrationRow` UI |
| `tests/integrations-config.test.ts` | xAI unit tests (save, test, details) |
| `tests/integrations-route.test.ts` | Route tests for xAI save and details |

## xAI API calls

| Action | Method | Endpoint | Billing |
| --- | --- | --- | --- |
| Test key | GET | `https://api.x.ai/v1/tts/voices` | No TTS synthesis |
| Key metadata | GET | `https://api.x.ai/v1/api-key` | Account read |
| Built-in voices | GET | `https://api.x.ai/v1/tts/voices` | List only |
| Custom voices | GET | `https://api.x.ai/v1/custom-voices?limit=100` | Best-effort; 403 tolerated |

Auth header: `Authorization: Bearer <apiKey>`.

## Verification

- `bun test --isolate tests/integrations-config.test.ts tests/integrations-route.test.ts` → 21 tests pass
- CI on PR #104: test + integration green

## Known gap (documented in TODO.md)

`readXaiApiKey()` is not consumed by ingest, export, or MCP yet. Settings integrations are key storage and validation only. Generated voice audio should still land in `projects/<slug>/assets/` and register via `openklip asset-add`.

## Documentation (v0.42.0.2)

- `CHANGELOG.md`, `docs/RELEASE-NOTES.md`, `VERSION`, `package.json`
- `README.md` (Settings → Integrations, `.openklip/integrations.json`)
- `AGENTS.md` (Settings integrations table + HTTP surface)
- `TODO.md` (completed item + Known Limitations)
- `CLAUDE.md` (release memory)

## Verdict

**SHIPPED** (feature merged #104). **DOCUMENTED** (v0.42.0.2).
