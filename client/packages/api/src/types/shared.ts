import { z } from "zod";

export const BoundingBoxSchema = z.object({
	left: z.number(),
	top: z.number(),
	width: z.number(),
	height: z.number(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
