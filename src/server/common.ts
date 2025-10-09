import { NextRequest } from "next/server";

export function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const validateSourceUrl = (url: string) => {
  if (!url) {
    console.log("Invalid request URL");
    return false;
  }
  return true;
};
export const validateAllowedUrlAndPathElseRespond = (
  origin: string,
  request: NextRequest,
  allowedURL: string,
  allowedPaths: string[]
) => {
  // Get Query Params
  const requestUrl = new URL(request.url);
  const pathQueryParam = requestUrl?.searchParams.get("path");
  console.log({ pathQueryParam });
  const sanitizedPathQueryParam = pathQueryParam?.replace(
    /[^a-zA-Z0-9-_\/]/g,
    ""
  );

  // Get source URL
  const originUrl = new URL(origin);
  const requesterURL = originUrl?.origin;

  // Normalize URLs by removing www. for comparison
  const normalizeUrl = (url: string) =>
    url.replace(/^https?:\/\/(www\.)?/, (match, www) => {
      return match.replace("www.", "");
    });

  const normalizedAllowedURL = normalizeUrl(allowedURL);
  const normalizedRequesterURL = normalizeUrl(requesterURL);

  console.log({
    allowedURL,
    requesterURL,
    normalizedAllowedURL,
    normalizedRequesterURL,
    allowedPaths,
    sanitizedPathQueryParam,
  });

  if (normalizedAllowedURL !== normalizedRequesterURL) {
    console.log("Origin URL is not allowed", {
      allowedURL,
      requesterURL,
      normalizedAllowedURL,
      normalizedRequesterURL,
    });
    return false;
  }

  // Check if Source URL PATH is same as Allowed Paths
  if (
    !allowedPaths ||
    !sanitizedPathQueryParam ||
    !allowedPaths.includes(sanitizedPathQueryParam)
  ) {
    console.log("Path not allowed for this origin", {
      requesterURL,
      sanitizedPathQueryParam,
    });
    return false;
  }

  return true;
};
