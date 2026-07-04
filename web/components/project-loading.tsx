import { OpenKlipLoader } from "@/components/openklip-loader";
import { helloLoadingLabel } from "@/lib/hello-loading-labels";

export function ProjectLoading() {
  return <OpenKlipLoader label={helloLoadingLabel("project")} />;
}
