/**
 * Provider stream URLs carry the account's username and password in their
 * path (…/live/<user>/<pass>/<id>.ts), and Podium's error text includes them
 * verbatim. Full URLs are cut to their host; credentials written without a
 * scheme (user:pass@host, ?username=…&password=…, a bare /live/<user>/<pass>/
 * path) are masked too.
 */
export function redactUrls(text: string): string {
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, (match) => {
      // A trailing ":" belongs to the sentence ("…/x.ts: Server returned 404"), not the URL.
      const trailing = match.match(/[:.,;)]+$/)?.[0] ?? "";
      try {
        return new URL(match.slice(0, match.length - trailing.length)).host + trailing;
      } catch {
        return "[url]" + trailing;
      }
    })
    .replace(/[^\s"'<>/@:]+:[^\s"'<>/@]+@(?=[\w.-])/g, "")
    .replace(/([?&;](?:user(?:name)?|pass(?:word)?|pwd|token|api_?key|key)=)[^&\s"'<>]+/gi, "$1[redacted]")
    .replace(/\/(live|movie|series|timeshift)\/[^/\s"'<>]+\/[^/\s"'<>]+\//gi, "/$1/[redacted]/");
}
