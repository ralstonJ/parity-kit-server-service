import { NextRequest, NextResponse } from "next/server";
import { getDbConnection } from "@/db";
import { geolocation } from "@vercel/functions";
import {
  getTierForCountryWithFallback,
  getUserApplications,
} from "@/app/api/tier/[apiKey]/helper";
import {
  corsHeaders,
  validateAllowedUrlAndPathElseRespond,
  validateSourceUrl,
} from "@/server/common";
import { Redis } from "@upstash/redis";

// Initialize Redis
const redis = Redis.fromEnv();
/**
 * Validates API key and returns application details
 * @param apiKey - The API key to validate
 * @returns Promise<{isValid: boolean, appId?: string, url?: string}>
 */
async function validateApiKey(apiKey: string): Promise<{
  isValid: boolean;
}> {
  try {
    const sql = await getDbConnection();

    const applications = await sql`
      SELECT application_api_key FROM applications 
      WHERE application_api_key = ${apiKey}
    `;

    if (applications.length === 0) {
      return { isValid: false };
    }

    return {
      isValid: true,
    };
  } catch {
    console.error("Error validating request.");
    return { isValid: false };
  }
}

/**
 * Validates request headers for additional security
 * @param request - The NextRequest object
 * @returns boolean - True if headers are suspicious
 */
function detectSuspiciousHeaders(request: NextRequest): boolean {
  // const suspiciousHeaders = [
  //   "X-Forwarded-For",
  //   "X-Real-IP",
  //   "CF-Connecting-IP",
  //   "X-Forwarded-Host",
  //   "X-Forwarded-Proto",
  // ];

  // // Check for multiple IP headers (potential proxy spoofing)
  // const ipHeaders = suspiciousHeaders.filter((header) =>
  //   request.headers.get(header)
  // );

  // if (ipHeaders.length > 2) {
  //   return true;
  // }

  // Check for suspicious user agents
  const userAgent = request.headers.get("User-Agent") || "";
  const suspiciousUserAgents = [
    "curl",
    "wget",
    "python",
    "postman",
    "insomnia",
  ];

  if (
    suspiciousUserAgents.some((agent) =>
      userAgent.toLowerCase().includes(agent)
    )
  ) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const origin = request.headers.get("Origin") || "";
    const { country, city } = geolocation(request);
    const { events, appId } = body;
    const apiKey = appId;

    console.log("apiKey", apiKey);
    const isValid = validateSourceUrl(request?.url);
    if (!isValid)
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 200, headers: corsHeaders(origin) }
      );

    console.log("isValid", isValid);
    if (!country || !apiKey) {
      return NextResponse.json(
        { error: "invalid request" },
        {
          status: 200,
          headers: corsHeaders(origin),
        }
      );
    }

    const sanitizedApiKey = apiKey?.replace(/[^a-zA-Z0-9-_\/]/g, "");
    console.log("sanitizedApiKey", sanitizedApiKey);
    if (!sanitizedApiKey) {
      return NextResponse.json(
        { error: "Invalid apiKey" },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    // Get client IP for rate limiting
    const clientIP =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    console.log("clientIP", clientIP);

    // Detect suspicious headers
    if (detectSuspiciousHeaders(request)) {
      console.warn(
        `Suspicious headers detected for API key: ${apiKey}, IP: ${clientIP}`
      );
      return NextResponse.json(
        { error: "Suspicious request detected" },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    // Validate API key and get application details
    const apiKeyValidation = await validateApiKey(sanitizedApiKey);

    if (!apiKeyValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid Request" },
        { status: 200, headers: corsHeaders(origin) }
      );
    }
    console.log("apiKeyValidation", apiKeyValidation);

    // Normalize country code to uppercase
    const countryCode = country.toUpperCase();

    const userApplications = await getUserApplications(sanitizedApiKey);

    if (userApplications.length === 0) {
      return NextResponse.json(
        { error: "No applications found" },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    const [{ url: allowedURL, paths: allowedPaths }] = userApplications;

    const isValidUrlAndPath = validateAllowedUrlAndPathElseRespond(
      origin,
      request,
      allowedURL,
      allowedPaths
    );

    if (!isValidUrlAndPath) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    // Use the new fallback logic function
    const tier = await getTierForCountryWithFallback(
      sanitizedApiKey,
      countryCode
    );

    if (!tier) {
      return NextResponse.json(
        {
          error:
            "Invalid request no tier found for this country, {country: " +
            countryCode +
            ", city: " +
            city +
            "}",
        },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    const trackedEvents = events.map(
      (event: {
        eventName: string;
        path: string;
        timestamp: string;
        deviceType?: string;
        browser?: string;
        visitorHash: string;
      }) => {
        return {
          ...event,
          country,
          city,
        };
      }
    );

    const key = sanitizedApiKey + ":parity-kit-events";
    const exists = await redis.exists(key);
    if (exists) {
      trackedEvents.forEach(
        async (item: {
          visitorHash: string;
          eventName: string;
          path: string;
          timestamp: string;
          country: string;
          city: string;
          deviceType: string;
          browser: string;
        }) => {
          await redis.json.arrappend(key, "$", item);
        }
      );
    } else {
      await redis.json.set(key, "$", trackedEvents);
    }
    return NextResponse.json(
      { message: "Events saved successfully" },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch tier information" },
      {
        status: 200,
      }
    );
  }
}
