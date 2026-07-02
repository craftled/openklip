// The dialog is authoritative once it has actually been used: whatever
// maxHeight it submits (including undefined for Manual+Source, meaning
// source-native) wins verbatim. The legacy `export1080` toggle only fills in
// a default when there is NO dialog options object at all -- the
// CinemaPlayer toolbar's bare Export button (web/components/cinema-player.tsx)
// calls onExport() with zero arguments, bypassing the dialog entirely, so it
// has no per-export maxHeight of its own and is the one legitimate remaining
// use of export1080.
//
// Before this helper existed, web/app.tsx computed
// `options?.maxHeight ?? (export1080 ? 1080 : undefined)` unconditionally.
// export1080 defaults to true, so any dialog submission whose real, intended
// maxHeight happened to come back undefined (a platform preset meaning
// "cap at N", pre-dating the export-dialog.tsx fix that now always resolves
// a concrete number) got silently downgraded to 1080 on the first export of
// a session, before any manual toggle. This helper removes that footgun by
// only consulting export1080 when there was no dialog options object to
// begin with.
export function resolveExportMaxHeight(
  dialogMaxHeight: number | undefined,
  hasDialogOptions: boolean,
  export1080Fallback: boolean
): number | undefined {
  if (hasDialogOptions) {
    return dialogMaxHeight;
  }
  return export1080Fallback ? 1080 : undefined;
}
