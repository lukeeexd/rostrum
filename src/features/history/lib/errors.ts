/** Podium's raw pass errors, in plain words where we recognise them. */
export function describeRunError(error: string): string {
  if (/could not reach dispatcharr|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed/i.test(error)) {
    return "Could not reach Dispatcharr";
  }
  if (/\b(401|403)\b|credential|unauthori[sz]ed|forbidden/i.test(error)) return "Dispatcharr refused the credentials";
  return error.length > 60 ? `${error.slice(0, 60)}…` : error;
}
