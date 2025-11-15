import { z } from "zod";
import { BoundingBoxSchema } from "./shared";

export const ResearchTypeSchema = z.enum([
	"image_gen",
	"image_given",
	"text_gen",
	"text_given",
	"subway_gen",
]);

export type ResearchType = z.infer<typeof ResearchTypeSchema>;

export const ResearchTaskSchema = z.object({
	boundingBox: BoundingBoxSchema,
	referenceElementKey: z.string(),
	prompt: z.string(),
	researchType: ResearchTypeSchema,
});

export type ResearchTask = z.infer<typeof ResearchTaskSchema>;

export const ChartSchema = z.object({
	id: z.string(),
	chart: z.string(),
});

export const StatSchema = z.object({
	id: z.string(),
	value: z.string(),
});

export const CreateResearchTaskInputSchema = z.object({
	charts: z.array(ChartSchema),
	stats: z.array(StatSchema),
	subwayLines: z.array(z.string()),
});

export const HeuristicSchema = z.object({});

export type Chart = z.infer<typeof ChartSchema>;
export type Stat = z.infer<typeof StatSchema>;

export type CreateResearchTaskInput = z.infer<
	typeof CreateResearchTaskInputSchema
>;
