import { isRouteErrorResponse, useRouteError } from "react-router";
import { Notice } from "@/components/shared/Notice";
import { Button } from "@/components/ui/buttons/button";

/** Shown inside the shell when a page throws, so one broken view never blanks the whole app. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : (error as Error)?.message;
  return (
    <Notice
      tone="bad"
      action={
        <Button variant="secondary" size="xs" onClick={() => window.location.reload()}>
          Reload
        </Button>
      }
    >
      This page hit an error{message ? `: ${message}` : "."}
    </Notice>
  );
}
