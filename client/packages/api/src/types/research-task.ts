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
	maxOutputTokens: z.number().optional(),
	recommendedOutputTokens: z.number().optional(),
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
	summary: z.string().optional(),
	preferred_line: z.string().optional(),
	preferred_station: z.string().optional(),
	neighborhood_likes: z.array(z.string()).optional(),
	neighborhood_dislikes: z.array(z.string()).optional(),
	alternative_stations: z.array(z.string()).optional(),
	alternative_neighborhoods: z.array(z.string()).optional(),
	commute_preferences: z.string().optional(),
	budget_range: z.string().optional(),
	lifestyle_preferences: z.array(z.string()).optional(),
	amenities_desired: z.array(z.string()).optional(),
	charts: z.array(ChartSchema).optional(),
	stats: z.array(StatSchema).optional(),
	subwayLines: z.array(z.string()).optional(),
});

export const HeuristicSchema = z.object({});

export type Chart = z.infer<typeof ChartSchema>;
export type Stat = z.infer<typeof StatSchema>;

export type CreateResearchTaskInput = z.infer<
	typeof CreateResearchTaskInputSchema
>;
