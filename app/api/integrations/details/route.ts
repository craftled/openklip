import {
  fetchElevenLabsDetails,
  fetchXaiVoiceDetails,
} from "@engine/integrations-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const provider = new URL(req.url).searchParams.get("provider");
  try {
    if (provider === "xai") {
      return Response.json({ xai: await fetchXaiVoiceDetails() });
    }
    return Response.json({ elevenLabs: await fetchElevenLabsDetails() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
