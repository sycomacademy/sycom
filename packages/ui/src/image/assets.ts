/**
 * Catalogue of static (committed-ish) assets hosted on the CDN.
 * Public IDs are the storage keys uploaded to Cloudinary; renaming an
 * asset is one edit here, not a search-and-replace across the codebase.
 *
 * User-generated assets (avatars, course content) live in the DB, not here.
 */

export const BRAND = {
  LOGO: "brand/sycom-logo-jpg",
  LOGO_PNG: "brand/sycom-logo-png",
  FAVICON: "brand/favicon",
  LOGO_ICON: "brand/sycom-logo-icon-jpg",
} as const;

/**
 * Certificate-only artwork. These are optional: a certificate still renders
 * without them, so each one is gated by `certificateAssets` in
 * `@sycom/certificates` until the file has been uploaded to the CDN.
 */
export const CERTIFICATE = {
  STAMP: "brand/certificate-stamp",
  SIGNATURE: "brand/certificate-signature",
} as const;
