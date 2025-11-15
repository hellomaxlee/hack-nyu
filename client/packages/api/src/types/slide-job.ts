import { z } from "zod";
import { ResearchTaskSchema } from "./research-task";
import { BoundingBoxSchema } from "./shared";

const jobTools = ["text", "image"] as const;
export const JobToolEnumSchema = z.enum(jobTools);

export const DeleteSlideJobSchema = z.object({
	type: z.literal("delete"),
	parent: ResearchTaskSchema,
	boundingBox: BoundingBoxSchema,
	referenceElementKey: z.string(),
});

export type DeleteSlideJob = z.infer<typeof DeleteSlideJobSchema>;

export const SlideJobSchema = z.object({
	type: z.literal("create"),
	parent: ResearchTaskSchema,
	referenceElementKey: z.string(),
	boundingBox: BoundingBoxSchema,
	jobTool: JobToolEnumSchema,
	params: z.discriminatedUnion("jobTool", [
		z.object({
			jobTool: z.literal(jobTools[0]),
			content: z.string(),
		}),
		z.object({
			jobTool: z.literal(jobTools[1]),
			url: z.string(),
		}),
	]),
});

export type JobTool = z.infer<typeof JobToolEnumSchema>;
export type SlideJob = z.infer<typeof SlideJobSchema>;
