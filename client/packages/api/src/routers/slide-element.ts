import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { publicProcedure } from "../index";
import type {
	BoundingBox,
	ImageSlideElement,
	SlideJob,
	TextSlideElement,
} from "../types";

interface ReducedTextToFit {
	value: string;
	fontSize: number;
}

const getReducedTextToFit = (
	text: string,
	_boundingBox: BoundingBox,
): ReducedTextToFit => {
	const _fontSizesToTry = [16, 14, 12, 10];
	const _valueCutoffToTry = [1, 0.8, 0.6, 0.5];
	// A little bit of a grid search to find the best fit, the largest text size with most content without exceeding the bounding box.
	// def canva_smart_resize(element, old_canvas, new_canvas):
	//     scale_factor = min(
	//         new_canvas.width / old_canvas.width,
	//         new_canvas.height / old_canvas.height
	//     )
	//     new_font_size = element.font_size * scale_factor
	//     # Snap to "sensible" font sizes
	//     size_breakpoints = [8, 10, 12, 14, 16, 18, 24, 32, 48, 64]
	//     new_font_size = nearest_breakpoint(new_font_size, size_breakpoints)
	//     return new_font_size

	// step 1: apply heuristic to translate bounding box area and text "style", title/header/paragraph (copy google doc's) to a starter *text length*. font size is large at first
	// step 2: apply smart resize to get a sensible font size, maybe even from pulling heuristic common font sizes
	// step 3: either alter wording to make a little shorter, or longer, or adjust font size further to fit box.

	const fontSize = 16;
	const filledValue = text.slice(0);
	return { value: filledValue, fontSize };
};

interface FontStyles {
	fontWeight: number;
	fontColor: string;
	fontFamily: string;
	textAlign: "left" | "center" | "right";
}

const getDefaultFontStyles = (): FontStyles => {
	return {
		fontWeight: 400,
		fontColor: "#000000",
		fontFamily: "Arial",
		textAlign: "left",
	};
};

const createSlideElements = async (): Promise<
	Array<TextSlideElement | ImageSlideElement>
> => {
	const outputsDir = join(process.cwd(), "outputs");
	const slideJobs = readFileSync(join(outputsDir, "slide-jobs.json"), "utf8");
	const slideJobsArray = JSON.parse(slideJobs) as SlideJob[];

	const slideElements: Array<TextSlideElement | ImageSlideElement> = [];
	for (const slideJob of slideJobsArray) {
		if (slideJob.params.jobTool === "text") {
			slideElements.push({
				boundingBox: slideJob.boundingBox,
				...getReducedTextToFit(slideJob.params.content, slideJob.boundingBox),
				...getDefaultFontStyles(),
			} as TextSlideElement);
		} else if (slideJob.params.jobTool === "image") {
			// TODO might also need to do agent loop resizing of this bounding box here. Here the bbox gets adjusted rather than the content of the image bc image must fill the box.
			slideElements.push({
				boundingBox: slideJob.boundingBox,
				value: slideJob.params.url,
			} as ImageSlideElement);
		}
	}

	writeFileSync(
		join(outputsDir, "slide-elements.json"),
		JSON.stringify(slideElements, null, 2),
		{ flag: "wx" },
	);
	await new Promise((resolve) => setTimeout(resolve, 2000));

	return slideElements;
};

export const slideElementRouter = {
	create: publicProcedure.input(z.object({})).handler(createSlideElements),
};
