import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { publicProcedure } from "../index";
import type { BoundingBox, ResearchTask, SlideJob } from "../types";

const getInsetBoundingBox = (boundingBox: BoundingBox): BoundingBox => {
	const inset = 10;
	return {
		left: boundingBox.left + inset,
		top: boundingBox.top + inset,
		width: boundingBox.width - inset * 2,
		height: boundingBox.height - inset * 2,
	};
};

const getImageListBoundingBox = (
	index: number,
	boundingBox: BoundingBox,
): BoundingBox => {
	const imageWidth = boundingBox.width / 4;
	const imageHeight = boundingBox.height;
	const imageLeft = boundingBox.left + index * imageWidth;
	const imageTop = boundingBox.top;
	return getInsetBoundingBox({
		left: imageLeft,
		top: imageTop,
		width: imageWidth,
		height: imageHeight,
	});
};

const researchLogoImage = (_subject: string, _questionn: string): string => {
	return "https://picsum.photos/200";
};

const researchAnswerText = (_subject: string, _question: string): string => {
	const lorem =
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
	return lorem;
};

const createSlideJob = async (): Promise<SlideJob[]> => {
	const outputsDir = join(process.cwd(), "outputs");
	const researchTasks = readFileSync(
		join(outputsDir, "research-tasks.json"),
		"utf8",
	);
	const researchTasksArray = JSON.parse(researchTasks) as ResearchTask[];

	const slideJobs: SlideJob[] = [];
	for (const researchTask of researchTasksArray) {
		if (researchTask.question.includes("relevant_portfolio_companies")) {
			for (let i = 0; i < 4; i++) {
				const researchQuery = `Research the portfolio companies of ${researchTask.subject}. Find the logo of the ${i + 1}th company in the relevant portfolio companies for ${researchTask.subject}`;
				slideJobs.push({
					parent: researchTask,
					boundingBox: getImageListBoundingBox(i, researchTask.boundingBox),
					jobTool: "image",
					params: {
						jobTool: "image",
						url: researchLogoImage(researchTask.subject, researchQuery),
					},
				});
			}
		} else if (researchTask.question.includes("company_logo")) {
			const researchQuery = `Find the company logo of ${researchTask.subject}`;
			slideJobs.push({
				parent: researchTask,
				boundingBox: getInsetBoundingBox(researchTask.boundingBox),
				jobTool: "image",
				params: {
					jobTool: "image",
					url: researchLogoImage(researchTask.subject, researchQuery),
				},
			});
		} else if (researchTask.question.includes("key_contacts")) {
			const researchQuery = `Write in bullet points the key contacts of ${researchTask.subject}`;
			// this may need custom support for bullet points. possibly a tool call.

			slideJobs.push({
				parent: researchTask,
				boundingBox: getInsetBoundingBox(researchTask.boundingBox),
				jobTool: "text",
				params: {
					jobTool: "text",
					content: researchAnswerText(researchTask.subject, researchQuery),
				},
			});
		} else if (researchTask.question.includes("commentary")) {
			const researchQuery = `Find the commentary of ${researchTask.subject}`;
			slideJobs.push({
				parent: researchTask,
				boundingBox: getInsetBoundingBox(researchTask.boundingBox),
				jobTool: "text",
				params: {
					jobTool: "text",
					content: researchAnswerText(researchTask.subject, researchQuery),
				},
			});
		}
	}

	writeFileSync(
		join(outputsDir, "slide-jobs.json"),
		JSON.stringify(slideJobs, null, 2),
		{ flag: "wx" },
	);
	await new Promise((resolve) => setTimeout(resolve, 2000));
	return slideJobs;
};

export const slideJobRouter = {
	create: publicProcedure.input(z.object({})).handler(createSlideJob),
};
