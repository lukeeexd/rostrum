import type { WorkerState } from "@/api/types";
import { workerNotice } from "@/lib/worker";
import { Notice } from "./Notice";

/** Explains a worker that is not checking anything; renders nothing when it is active. */
export function WorkerNotice({ worker }: { worker: WorkerState | undefined }) {
  const notice = workerNotice(worker);
  return notice && <Notice tone={notice.tone}>{notice.text}</Notice>;
}
