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
import emojiFlags from "emoji-flags";

function stackedTotalDiscount(d1: number, d2: number) {
  const factor = (1 - d1 / 100) * (1 - d2 / 100);
  const totalDiscount = (1 - factor) * 100;
  return Math.round(totalDiscount);
}

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

/**
 * GET /api/tiers/[country]/[appId]
 * Gets tier information for a specific country and application with fallback logic:
 * 1. Check tier_overrides for the country
 * 2. If no override found, check tiers table for the country
 * 3. If no tier found, return default tier
 *
 * Security: Multiple layers of protection including API key validation,
 * rate limiting, and suspicious header detection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ apiKey: string }> }
) {
  try {
    const origin = request.headers.get("Origin") || "";
    const { country } = geolocation(request);
    const { apiKey } = await params;

    const isValid = validateSourceUrl(request?.url);
    if (!isValid)
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 200, headers: corsHeaders(origin) }
      );

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
          country: countryCode,
          api_key: apiKey,
          tier: null,
          message:
            "No tier found for this country and no default tier available",
        },
        {
          status: 200,
          headers: corsHeaders(origin),
        }
      );
    }

    return NextResponse.json(
      {
        country: countryCode,
        country_flag: emojiFlags.countryCode(countryCode).emoji,
        country_name: emojiFlags.countryCode(countryCode).name,
        discount_type: tier.discount_type,
        discount_value: stackedTotalDiscount(
          tier.launch_discount_value,
          tier.discount_value
        ),
        discount_code: tier.discount_code,
        content: tier.content,
        style: tier.style,
        active: tier.active,
        message: "Tier found using fallback logic",
      },
      {
        status: 200,
        headers: corsHeaders(origin),
      }
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
