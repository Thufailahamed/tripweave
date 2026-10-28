import { z } from "zod";

/**
 * Public reference data for a place named in a planning reply: its article, a short description, a
 * Wikimedia photograph and coordinates. The API resolves these once and caches them for every user;
 * the model only ever supplies the place name.
 */
export const PLACE_NAME_MAX_LENGTH = 80;
export const PLACE_LOOKUP_MAX = 12;

export const placeNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(PLACE_NAME_MAX_LENGTH)
  .regex(/^[^\u0000-\u001f\u007f]+$/, "Control characters are not allowed");

export const placeInfoSchema = z.object({
  name: z.string(),
  articleTitle: z.string(),
  articleUrl: z.string().url(),
  extract: z.string().nullable(),
  imageUrl: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});
export type PlaceInfo = z.infer<typeof placeInfoSchema>;

export const placeLookupRequestSchema = z.object({
  names: z.array(placeNameSchema).min(1).max(PLACE_LOOKUP_MAX),
});
export type PlaceLookupRequest = z.infer<typeof placeLookupRequestSchema>;
