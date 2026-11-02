import { requireModuleAuthorization } from "@/lib/authorization-server";
import { POST as legacyPOST } from "./route-legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  const gate = await requireModuleAuthorization("estoque-rotativo", "administrar");
  if (!gate.current) return gate.errorResponse;
  return legacyPOST(request);
}
