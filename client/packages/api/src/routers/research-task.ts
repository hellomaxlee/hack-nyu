import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publicProcedure } from "../index";
import type {
	BoundingBox,
	Chart,
	Stat,
	CreateResearchTaskInput,
	ResearchTask,
	ResearchType,
	SlideJob,
	DeleteSlideJob,
} from "../types";
import { CreateResearchTaskInputSchema } from "../types";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

type TaskInfo = {
	primary_key: string;
	value: string;
};

type HeuristicData = {
	research: {
		prompt: string;
		research_type: ResearchType;
		max_output_tokens?: number;
		recommended_output_tokens?: number;
	};
	bounding_box: BoundingBox;
};

const mapHeuristicToPrompt = (
	heuristicPrompt: string,
	charts: Chart[],
	stats: Stat[],
	subwayLines: string[],
) => {
	// const chart_1 = charts.find((chart) => chart.id === "chart_1")?.chart;
	// if (!chart_1) return undefined;
	// const chart_1_buffer = await chart_1.arrayBuffer();

	switch (heuristicPrompt) {
		case "subway_1":
			return subwayLines.join(" ");
		case "chart_1":
			return charts.find((chart) => chart.id === "chart_1")?.chart;
		case "stats_1":
			return stats.find((stat) => stat.id === "stats_1")?.value;
		case "stats_2":
			return stats.find((stat) => stat.id === "stats_2")?.value;
		default:
			return heuristicPrompt;
	}
};

// in agent sense this is creating an orchestration plan... it should be a create_plan tool.
const createResearchTasks = async ({
	input,
}: {
	input: CreateResearchTaskInput;
}): Promise<ResearchTask[]> => {
	const { charts, stats, subwayLines } = input;
	// const heuristic = readFileSync(join(process.cwd(), "heuristic.json"), "utf8");
	const taskList = JSON.parse(
		readFileSync(
			join(process.cwd(), "..", "..", "packages", "shapes_info.json"),
			"utf8",
		),
	) as TaskInfo[];

	const heuristic = JSON.parse(
		readFileSync(
			join(process.cwd(), "..", "..", "packages", "heuristic.json"),
			"utf8",
		),
	) as Record<string, HeuristicData>;

	// we basically did this above
	// const taskList = await inferTaskList(prompt, xmlSlide);
	const tasks: ResearchTask[] = taskList
		.map((task) => {
			const heuristicData: HeuristicData | undefined =
				heuristic[task.primary_key];

			if (!heuristicData) {
				return null;
			}

			const prompt = mapHeuristicToPrompt(
				heuristicData.research.prompt,
				charts,
				stats,
				subwayLines,
			);

			if (prompt === undefined) {
				return null;
			}

			let maxOutputTokens: number | null = null;
			let recommendedOutputTokens: number | null = null;
			if (heuristicData.research.research_type === "text_gen") {
				maxOutputTokens = heuristicData.research.max_output_tokens ?? null;
				recommendedOutputTokens =
					heuristicData.research.recommended_output_tokens ?? null;
			}

			return {
				boundingBox: heuristicData.bounding_box,
				referenceElementKey: task.primary_key,
				prompt: prompt,
				maxOutputTokens: maxOutputTokens,
				recommendedOutputTokens: recommendedOutputTokens,
				researchType: heuristicData.research.research_type,
			} as ResearchTask;
		})
		.filter((task): task is ResearchTask => task !== null);

	return tasks;
};

// const computeResearchTask = async (
// 	researchType: ResearchType,
// 	prompt: string,
// ): Promise<string> => {
// 	switch (researchType) {
// 		case "image_gen":
// 			return prompt;
// 		case "image_given":
// 			return prompt;
// 		case "text_gen":
// 			return prompt;
// 		case "text_given":
// 			return prompt;
// 		case "subway_gen":
// 			return prompt;
// 		default:
// 			throw new Error(`Unsupported research type: ${researchType}`);
// 	}
// };

const answerResearchTask = async (
	researchTask: ResearchTask,
): Promise<SlideJob | null> => {
	const prompt = researchTask.prompt;
	const researchType = researchTask.researchType;
	console.log("researchType", researchTask);
	// const researchResults = await computeResearchTask(researchType);

	if (researchType === "image_gen") {
		// TODO implement image insertion and updates
		return null;
	}

	if (researchType === "image_given") {
		return {
			type: "create",
			parent: researchTask,
			boundingBox: researchTask.boundingBox,
			referenceElementKey: researchTask.referenceElementKey,
			jobTool: "image",
			params: {
				jobTool: "image",
				url: prompt,
			},
		} as SlideJob;
	}

	if (researchType === "subway_gen") {
		return {
			type: "create",
			parent: researchTask,
			boundingBox: researchTask.boundingBox,
			referenceElementKey: researchTask.referenceElementKey,
			jobTool: "text",
			params: {
				jobTool: "text",
				content: prompt,
			},
		} as SlideJob;
	}

	if (researchType === "text_given") {
		return {
			type: "create",
			parent: researchTask,
			boundingBox: researchTask.boundingBox,
			referenceElementKey: researchTask.referenceElementKey,
			jobTool: "text",
			params: {
				jobTool: "text",
				content: prompt,
			},
		} as SlideJob;
	}

	if (researchType === "text_gen") {
		const { text } = await generateText({
			model: openrouter.chat("anthropic/claude-3.5-sonnet"),
			prompt: `
			${researchTask.prompt}. Please output ${researchTask.recommendedOutputTokens} tokens.
			`,
			maxOutputTokens: researchTask.maxOutputTokens,
		});

		const generatedContent = text;
		console.log("generatedContent", generatedContent);

		return {
			type: "create",
			parent: researchTask,
			boundingBox: researchTask.boundingBox,
			referenceElementKey: researchTask.referenceElementKey,
			jobTool: "text",
			params: {
				jobTool: "text",
				content: generatedContent,
			},
		} as SlideJob;
	}

	return {
		type: "create",
		parent: researchTask,
		boundingBox: researchTask.boundingBox,
		referenceElementKey: researchTask.referenceElementKey,
		jobTool: "text",
		params: {
			jobTool: "text",
			content: prompt,
		},
	} as SlideJob;
};

const createDeleteSlideJobs = (
	researchTasks: ResearchTask[],
): DeleteSlideJob[] => {
	const deleteSlideJobs: DeleteSlideJob[] = [];
	for (const researchTask of researchTasks) {
		if (
			researchTask.researchType === "image_gen" ||
			researchTask.researchType === "image_given"
		) {
			continue;
		}

		deleteSlideJobs.push({
			type: "delete",
			parent: researchTask,
			boundingBox: researchTask.boundingBox,
			referenceElementKey: researchTask.referenceElementKey,
		} as DeleteSlideJob);
	}
	return deleteSlideJobs;
};

const doSlideJobTool = async (
	slideJob: SlideJob | DeleteSlideJob,
): Promise<void> => {
	// All slide job really needs is the value to update and the pptx id of the shape to update.
	if (slideJob.type !== "create") {
		throw new Error(`Unsupported slide job type: ${slideJob.type}`);
	}

	if (slideJob.jobTool === "image") {
		// TODO image slide job will update existing image pptx id with new image url
		const response = await fetch("http://localhost:8000/update-image", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				referenceElementKey: slideJob.referenceElementKey,
				imageUrl: (slideJob.params as { url: string }).url,
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to update image: ${response.statusText}`);
		}
		return;
	} else if (slideJob.jobTool === "text") {
		const response = await fetch("http://localhost:8000/update-shape", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				referenceElementKey: slideJob.referenceElementKey,
				content: (slideJob.params as { content: string }).content,
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to update shape: ${response.statusText}`);
		}
		return;
	} else {
		throw new Error(`Unsupported slide job tool: ${slideJob.jobTool}`);
	}
};

export const powerpointRouter = {
	createPlan: publicProcedure
		.input(CreateResearchTaskInputSchema)
		.handler(async ({ input }) => {
			const researchTasks = await createResearchTasks({ input });
			const slideJobs = await Promise.all(
				researchTasks.map(answerResearchTask),
			);
			const createSlideJobs = slideJobs.filter(
				(slideJob): slideJob is SlideJob => slideJob !== null,
			);
			// const deleteSlideJobs = createDeleteSlideJobs(researchTasks);
			await Promise.all(createSlideJobs.map(doSlideJobTool));
			return {
				createSlideJobs,
				// deleteSlideJobs,
			};
		}),
};
