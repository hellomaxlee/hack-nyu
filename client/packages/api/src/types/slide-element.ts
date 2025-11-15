import { z } from "zod";
import { BoundingBoxSchema } from "./shared";

export const BaseSlideElementSchema = z.object({
	boundingBox: BoundingBoxSchema,
});

export const TextSlideElementSchema = BaseSlideElementSchema.extend({
	value: z.string(),
	fontSize: z.number(),
	fontWeight: z.number(),
	fontColor: z.string(),
	fontFamily: z.string(),
	textAlign: z.enum(["left", "center", "right"]),
});

export const ImageSlideElementSchema = BaseSlideElementSchema.extend({
	value: z.string(),
});

export type BaseSlideElement = z.infer<typeof BaseSlideElementSchema>;
export type TextSlideElement = z.infer<typeof TextSlideElementSchema>;
export type ImageSlideElement = z.infer<typeof ImageSlideElementSchema>;
