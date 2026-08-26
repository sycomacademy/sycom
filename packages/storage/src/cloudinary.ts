import type {
  StorageEntityType,
  StorageFolder,
  StorageResourceType,
} from "@sycom/db/schema/storage";
import { env } from "@sycom/env/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const CLOUD_ROOT = "sycom-lms";

export function buildAssetFolder(folder: StorageFolder, entityId: string): string {
  return `${CLOUD_ROOT}/${folder}/${entityId}`;
}

export function buildPublicId(
  folder: StorageFolder,
  entityId: string,
  fileId: string = crypto.randomUUID(),
): string {
  return `${buildAssetFolder(folder, entityId)}/${fileId}`;
}

// Cloudinary tags are CSV-delimited; commas in a value would split a tag.
// We sanitize defensively even though entity/user ids are safe.
function sanitizeTagValue(value: string): string {
  return value.replace(/[,\s]/g, "_");
}

export function buildTags(input: {
  entityType: StorageEntityType;
  entityId: string;
  uploaderId: string;
  uploaderEmail: string;
}): string[] {
  return [
    `entity_type:${sanitizeTagValue(input.entityType)}`,
    `entity_id:${sanitizeTagValue(input.entityId)}`,
    `uploaded_by:${sanitizeTagValue(input.uploaderId)}`,
    `uploaded_by_email:${sanitizeTagValue(input.uploaderEmail)}`,
  ];
}

export function signUploadParams(input: {
  folder: StorageFolder;
  entityType: StorageEntityType;
  entityId: string;
  uploaderId: string;
  uploaderEmail: string;
}) {
  const publicId = buildPublicId(input.folder, input.entityId);
  const assetFolder = buildAssetFolder(input.folder, input.entityId);
  const timestamp = Math.round(Date.now() / 1000);
  const tags = buildTags({
    entityType: input.entityType,
    entityId: input.entityId,
    uploaderId: input.uploaderId,
    uploaderEmail: input.uploaderEmail,
  }).join(",");
  // NOTE: `max_file_size` cannot be signed — Cloudinary excludes it from the
  // upload signature, so including it here yields "Invalid Signature". The size
  // ceiling is enforced server-side in `storage.saveAsset` instead.
  const signature = cloudinary.utils.api_sign_request(
    { asset_folder: assetFolder, public_id: publicId, tags, timestamp },
    env.CLOUDINARY_API_SECRET,
  );

  return {
    uploadUrl: cloudinary.utils.api_url("upload", { resource_type: "auto" }),
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    publicId,
    assetFolder,
    tags,
  };
}

export type SignedUploadParams = ReturnType<typeof signUploadParams>;

/**
 * Cloudinary only knows three resource types (`image`, `video`, `raw`) while our
 * `StorageResourceType` enum has four. Every SDK call must go through this map:
 * the SDK types `resource_type` as a loose string, so an unmapped `"file"` or
 * `"audio"` type-checks fine and then silently builds a URL for an endpoint that
 * doesn't exist (`/file/download`, `/audio/destroy`).
 */
function deliveryResourceType(resourceType: StorageResourceType): "image" | "video" | "raw" {
  if (resourceType === "file") return "raw";
  if (resourceType === "audio") return "video";
  return resourceType;
}

export async function removeAsset(
  publicId: string,
  options?: { resourceType?: StorageResourceType; invalidate?: boolean },
): Promise<{ result: string }> {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: deliveryResourceType(options?.resourceType ?? "image"),
    invalidate: options?.invalidate ?? true,
  });
}

export function getPublicUrl(
  publicId: string,
  resourceType: StorageResourceType = "image",
): string {
  return cloudinary.url(publicId, {
    resource_type: deliveryResourceType(resourceType),
    secure: true,
  });
}

function withFormatExtension(publicId: string, format?: string): string {
  if (!format) return publicId;
  const ext = format.toLowerCase();
  if (publicId.toLowerCase().endsWith(`.${ext}`)) return publicId;
  return `${publicId}.${ext}`;
}

/** Signed URL for inline delivery (`<img>`, `<video>`, `<audio>`) or attachment download. */
export function getSignedDeliveryUrl(
  publicId: string,
  expireIn: number,
  options?: {
    download?: boolean;
    resourceType?: StorageResourceType;
    format?: string;
  },
): string {
  const resourceType = options?.resourceType ?? "image";
  const deliveryType = deliveryResourceType(resourceType);
  let id = publicId.replace(/^\/+/, "");
  const expiresAt = Math.round(Date.now() / 1000) + expireIn;

  // Raw ids are addressed with their extension; so are PDFs, which Cloudinary
  // stores as `image` but delivers under `<public_id>.pdf`. Attachments always
  // carry it so the downloaded file lands with a usable extension.
  if (options?.download || deliveryType === "raw" || resourceType === "image") {
    id = withFormatExtension(id, options?.format);
  }

  // NOTE: downloads use signed delivery + `fl_attachment` for every resource
  // type, raw included. The download API (`utils.private_download_url`) is not
  // an alternative here: it serves `private`/`authenticated` assets, and ours
  // are uploaded as plain `type: upload`, so it 404s with "Resource not found".
  // Cloudinary sets Content-Disposition from the asset's original filename.
  return cloudinary.url(id, {
    resource_type: deliveryType,
    secure: true,
    sign_url: true,
    expires_at: expiresAt,
    ...(options?.download ? { flags: "attachment" } : {}),
  });
}
