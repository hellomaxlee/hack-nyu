import { publicProcedure } from "../index";
import type { RouterClient } from "@orpc/server";
import { powerpointRouter } from "./research-task";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	powerpoint: powerpointRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
