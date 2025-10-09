import { getDbConnection } from "@/db";

// Define the Tier interface based on the database schema
export interface TierData {
  tier_id: string;
  app_id: string;
  name: string;
  country_codes: string[];
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discount_code: string | null;
  launch_discount_value: number;
  content: string | null;
  style: string | null;
  active: boolean;
  created_at: string;
}

export async function getUserApplications(apiKey: string) {
  const sql = await getDbConnection();
  const userApplications = await sql`
  SELECT
     a.*, u.payment_status AS user_status
   FROM applications a 
   LEFT JOIN user_applications ua ON a.app_id = ua.app_id
   LEFT JOIN users u ON ua.user_id = u.user_id
   WHERE a.application_api_key = ${apiKey};
  `;
  return userApplications;
}

/**
 * Gets tier information for a specific country with fallback logic:
 * 1. Check tier_overrides for the country
 * 2. If no override found, check tiers table for the country
 * 3. If no tier found, return default tier
 * @param appId - The application ID
 * @param countryCode - The country code (e.g., 'US', 'CA')
 * @returns Promise<Tier | null> - Tier object or null if not found
 */
export async function getTierForCountryWithFallback(
  appId: string,
  countryCode: string
): Promise<TierData | null> {
  try {
    const sql = await getDbConnection();
    const normalizedCountryCode = countryCode.toUpperCase();
    console.log("normalizedCountryCode", normalizedCountryCode);
    console.log("appId", appId);

    // 2. If no override found, check tiers table for this country
    const tiers = await sql`
      SELECT 
        t.name,
        t.country_codes,
        t.discount_type,
        t.discount_value,
        t.launch_discount_value,
        t.discount_code,
        t.content,
        t.style,
        t.active,
        t.created_at
      FROM tiers t
      JOIN applications a ON t.app_id = a.app_id
      WHERE t.active = true 
        AND a.application_api_key = ${appId}
        AND ${normalizedCountryCode} = ANY(t.country_codes)
        AND t.discount_value > 0
      ORDER BY t.created_at DESC  
      LIMIT 1
    `;

    return tiers.length > 0 ? (tiers[0] as TierData) : null;

    // if (tiers.length > 0) {
    //   return tiers[0] as Tier;
    // }

    // // 3. If no specific tier found, return the first available tier as default
    // const defaultTier = await sql`
    //   SELECT
    //     tier_id,
    //     app_id,
    //     name,
    //     country_codes,
    //     discount_type,
    //     discount_value,
    //     discount_code,
    //     content,
    //     style,
    //     active,
    //     created_at
    //   FROM tiers
    //   WHERE active = true
    //     AND app_id = ${appId}
    //   ORDER BY created_at ASC
    //   LIMIT 1
    // `;

    // return defaultTier.length > 0 ? (defaultTier[0] as Tier) : null;
  } catch {
    console.error("Failed");
    throw new Error("Failed");
  }
}
