# Tier API Documentation

## Overview

The Tier API endpoint provides dynamic pricing and discount information based on user geolocation. It implements a sophisticated fallback system to ensure users always receive appropriate pricing tiers for their country.

**Endpoint:** `GET /api/tier/[apiKey]`

## Purpose

This API is designed to:

- Provide country-specific pricing tiers for e-commerce applications
- Implement fallback logic to ensure users always get appropriate pricing
- Support dynamic discount codes and promotional content
- Maintain security through multiple validation layers

## Authentication

The API uses API key authentication passed as a URL parameter.

**Parameter:** `apiKey` (string, required)

- Must be a valid application API key
- Automatically sanitized to remove special characters
- Validated against the applications database

## Request Headers

| Header       | Required | Description                                        |
| ------------ | -------- | -------------------------------------------------- |
| `Origin`     | Yes      | The origin domain making the request               |
| `User-Agent` | Yes      | Browser user agent (suspicious agents are blocked) |

## Geolocation

The API automatically detects the user's country using Vercel's geolocation service:

- Extracts country from request headers
- Normalizes country code to uppercase
- Falls back to default tier if country detection fails

## Security Features

### 1. API Key Validation

- Validates API key against applications database
- Sanitizes input to prevent injection attacks
- Returns generic error messages for security

### 2. Origin Validation

- Validates request origin against allowed domains
- Checks URL paths for additional security
- Prevents unauthorized cross-origin requests

### 3. Suspicious Request Detection

- Blocks requests from suspicious user agents:
  - `curl`, `wget`, `python`, `postman`, `insomnia`
- Logs suspicious activity for monitoring
- Returns generic error responses

### 4. Rate Limiting Support

- Extracts client IP for rate limiting
- Supports multiple IP header formats
- Logs client IP for monitoring

## Fallback Logic

The API implements a sophisticated fallback system:

1. **Country-Specific Override**: Checks for country-specific tier overrides
2. **Country Tier**: Falls back to general country tier if no override exists
3. **Default Tier**: Uses application default tier if no country-specific tier exists
4. **No Tier**: Returns null tier with appropriate message if no tiers are configured

## Response Format

### Success Response (200)

```json
{
  "country": "US",
  "country_flag": "🇺🇸",
  "country_name": "United States",
  "discount_type": "percentage",
  "discount_value": 25,
  "discount_code": "SAVE25",
  "content": "Special offer for US customers!",
  "style": "background-color: #ff6b6b; color: white;",
  "active": true,
  "message": "Tier found using fallback logic"
}
```

### Error Response (200)

```json
{
  "error": "Invalid Request"
}
```

### No Tier Found Response (200)

```json
{
  "country": "US",
  "api_key": "your-api-key",
  "tier": null,
  "message": "No tier found for this country and no default tier available"
}
```

## Response Fields

| Field            | Type           | Description                                      |
| ---------------- | -------------- | ------------------------------------------------ |
| `country`        | string         | ISO country code (e.g., "US", "GB")              |
| `country_flag`   | string         | Emoji flag for the country                       |
| `country_name`   | string         | Full country name                                |
| `discount_type`  | string         | "percentage" or "fixed"                          |
| `discount_value` | number         | Combined discount value (launch + tier discount) |
| `discount_code`  | string \| null | Promotional code for the tier                    |
| `content`        | string \| null | Custom content/message for the tier              |
| `style`          | string \| null | CSS styles for banner display                    |
| `active`         | boolean        | Whether the tier is currently active             |
| `message`        | string         | Status message about tier retrieval              |

## Discount Calculation

The API automatically calculates stacked discounts:

- Combines launch discount with tier-specific discount
- Uses formula: `(1 - d1/100) * (1 - d2/100)`
- Returns rounded percentage value

## CORS Support

The API includes CORS headers for cross-origin requests:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

## Usage Examples

### JavaScript/Fetch

```javascript
const response = await fetch("/api/tier/your-api-key", {
  method: "GET",
  headers: {
    Origin: "https://yourdomain.com",
  },
});

const tierData = await response.json();
console.log(tierData);
```

### cURL

```bash
curl -X GET "https://yourdomain.com/api/tier/your-api-key" \
  -H "Origin: https://yourdomain.com" \
  -H "User-Agent: Mozilla/5.0 (compatible; YourApp/1.0)"
```

## Error Handling

The API returns HTTP 200 for all responses (including errors) with appropriate error messages:

- `"Invalid request"` - Origin validation failed
- `"Invalid apiKey"` - API key format is invalid
- `"Suspicious request detected"` - Security validation failed
- `"Invalid Request"` - API key validation failed
- `"No applications found"` - No applications associated with API key
- `"Failed to fetch tier information"` - Internal server error

## Rate Limiting

While not implemented in this endpoint, the API provides client IP extraction for rate limiting implementation:

- Extracts IP from `x-forwarded-for` header
- Falls back to `x-real-ip` header
- Logs IP for monitoring purposes

## Monitoring

The API includes comprehensive logging:

- Client IP addresses
- Suspicious request detection
- API key validation results
- Error conditions

## Dependencies

- `@vercel/functions` - Geolocation detection
- `emoji-flags` - Country flag and name mapping
- Custom database connection and validation utilities

## Notes

- All responses return HTTP 200 status for consistency
- Error messages are generic for security
- Country codes are automatically normalized to uppercase
- The API is designed for high availability with fallback logic
