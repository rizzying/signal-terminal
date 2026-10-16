/** Map the public /welcome path onto the static welcome document. Every other URL is returned unchanged. */
export function rewriteWelcome(url: string | undefined): string | undefined {
  if (url == null) return url;
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  if (path !== "/welcome" && path !== "/welcome/") return url;
  const search = q === -1 ? "" : url.slice(q);
  return "/welcome.html" + search;
}
