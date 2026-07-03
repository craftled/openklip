import { fetchElevenLabsDetails } from "@engine/integrations-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ elevenLabs: await fetchElevenLabsDetails() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
