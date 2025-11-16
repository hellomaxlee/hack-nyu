import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
    streamText,
    generateObject,
    type UIMessage,
    convertToModelMessages,
    tool,
    stepCountIs,
} from "ai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { z } from "zod";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// In-memory todo storage
interface Todo {
    id: string;
    title: string;
    description: string;
    status: "pending" | "in_progress" | "completed";
    priority: number;
    createdAt: string;
}

// In-memory research report storage
interface ResearchReportData {
    summary: string;
    preferred_line: string;
    preferred_station: string;
    budget_range?: string;
    lifestyle_preferences?: string[];
    amenities_desired?: string[];
    commute_preferences?: string;
    alternative_stations?: string[];
    neighborhood_likes?: string[];
    neighborhood_dislikes?: string[];
    alternative_neighborhoods?: string[];
    charts?: Array<{ id: string; chart: string }>;
    stats?: Array<{ id: string; value: string }>;
}

// Store the latest research report data
let pendingReportData: ResearchReportData | null = null;

// File path for storing report data
const REPORT_DATA_PATH = join(process.cwd(), "tmp", "report-data.json");

// Initialize with sample todos
const todoStorage: Map<string, Todo> = new Map([
    [
        "1",
        {
            id: "1",
            title: "Find affordable apartments",
            description:
                "Search for apartments near the user's subway station within budget",
            status: "pending",
            priority: 1,
            createdAt: new Date().toISOString(),
        },
    ],
    [
        "2",
        {
            id: "2",
            title: "Compare neighborhood amenities",
            description:
                "Research nearby grocery stores, restaurants, and parks",
            status: "pending",
            priority: 2,
            createdAt: new Date().toISOString(),
        },
    ],
    [
        "3",
        {
            id: "3",
            title: "Calculate commute times",
            description: "Estimate travel time to common destinations",
            status: "pending",
            priority: 3,
            createdAt: new Date().toISOString(),
        },
    ],
    [
        "4",
        {
            id: "4",
            title: "Create a research report",
            description:
                "First, summarize the conversation so far and the user's preferences when it comes to housing and which lines and station the user is interested in living nearby. Then use the generate_research_report to generate a final research report",
            status: "pending",
            priority: 4,
            createdAt: new Date().toISOString(),
        },
    ],
]);

interface StationInfo {
    stop_name: string;
    "Daytime.Routes": string;
    Latitude: number;
    Longitude: number;
    primary_line: string;
    distance_miles?: number;
}

interface StationsOnLinesResponse {
    closest_station: StationInfo[];
    lines: string[];
    stations_on_lines: StationInfo[];
}

// GET endpoint to retrieve pending report data (in-memory only for chat API)
export async function GET() {
    if (!pendingReportData) {
        return Response.json(
            { error: "No pending report data" },
            { status: 404 }
        );
    }

    return Response.json(pendingReportData);
}

export async function POST(req: Request) {
    const {
        messages,
        system,
        tools,
        latitude,
        longitude,
    }: {
        messages: UIMessage[];
        system?: string; // System message forwarded from AssistantChatTransport
        tools?: any; // Frontend tools forwarded from AssistantChatTransport
        latitude?: number;
        longitude?: number;
    } = await req.json();

    const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
    });

    // Fetch relevant station from R API if coordinates are provided
    let stationData: StationsOnLinesResponse | null = null;
    if (latitude !== undefined && longitude !== undefined) {
        try {
            const response = await fetch(
                `http://localhost:8081/stations-on-lines?lat=${latitude}&lng=${longitude}`
            );
            if (response.ok) {
                stationData =
                    (await response.json()) as StationsOnLinesResponse;
            }
        } catch (error) {
            console.error("Failed to fetch station data:", error);
        }
    }

    // Build system prompt with station information
    let systemPrompt = system || "";
    if (stationData && stationData.closest_station.length > 0) {
        const closestStation = stationData.closest_station[0];
        systemPrompt += `\n\You are a helpful assistant that helps the user find apartments in NYC by looking at the subway lines they can take to work. Here is information about the nearest subway station to the user's office:
- Station Name: ${closestStation.stop_name}
- Daytime Routes: ${closestStation["Daytime.Routes"]}
- Lines on this station: ${stationData.lines.join(", ")}
- Station Location: ${closestStation.Latitude}, ${closestStation.Longitude}
- User Location: ${latitude}, ${longitude}
- Distance: ${
            closestStation.distance_miles
                ? closestStation.distance_miles.toFixed(2) + " miles"
                : "N/A"
        }

Here are all the stops that are on the lines of this station, which are the candidate areas for the user to live in. YOUR GOAL AS AN ASSISTANT is to help the user pick a train line and one of these stations on the line by walking them through the average rent details, nightlife, or other neighborhood details that are relevant to living near a train station. 

<candidate_stations>
(${stationData.lines.join(", ")}):
${stationData.stations_on_lines
    .slice(0, 10)
    .map((s) => `- ${s.stop_name} (${s.primary_line})`)
    .join("\n")}${
            stationData.stations_on_lines.length > 10
                ? `\n... and ${
                      stationData.stations_on_lines.length - 10
                  } more stations`
                : ""
        }
</candidate_stations>`;
    }

    // Enhanced system prompt with todo list instructions
    const todoSystemPrompt = `${systemPrompt}

IMPORTANT TODO LIST WORKFLOW:
You are equipped with a todo list management system to guide the user when they aren't sure what to do next. Follow this workflow:

1. FIRST STEP - ALWAYS call the ListTodos tool at the start of each conversation to load the current todo list
2. Review the todo list and identify the highest priority pending task (lowest priority number), and use the WriteTodo tool to update its status to "in_progress"
3. Work on completing that task using your available tools and capabilities
4. Once you complete a task, use WriteTodo to update its status to "completed"`;

    const result = streamText({
        model: openrouter.chat("anthropic/claude-3.5-sonnet"),
        system: todoSystemPrompt,
        messages: convertToModelMessages(messages),
        stopWhen: stepCountIs(10), // Allow multiple tool calling steps
        tools: {
            // Wrap frontend tools with frontendTools helper
            ...frontendTools(tools),

            // Todo Management Tools
            ListTodos: tool({
                description:
                    "Get the current todo list with all tasks, their status, priority, and details. ALWAYS call this first at the start of the conversation.",
                inputSchema: z.object({}),
                execute: async () => {
                    const todos = Array.from(todoStorage.values()).sort(
                        (a, b) => a.priority - b.priority
                    );
                    return {
                        todos,
                        summary: `Found ${todos.length} todos. ${
                            todos.filter((t) => t.status === "pending").length
                        } pending, ${
                            todos.filter((t) => t.status === "in_progress")
                                .length
                        } in progress, ${
                            todos.filter((t) => t.status === "completed").length
                        } completed.`,
                    };
                },
            }),

            WriteTodo: tool({
                description:
                    "Update the status of a todo item. Use this when you complete a task or start working on one.",
                inputSchema: z.object({
                    id: z.string().describe("The ID of the todo to update"),
                    status: z
                        .enum(["pending", "in_progress", "completed"])
                        .describe("The new status"),
                }),
                execute: async ({ id, status }) => {
                    const todo = todoStorage.get(id);
                    if (!todo) {
                        return {
                            success: false,
                            error: `Todo with id ${id} not found`,
                        };
                    }
                    todo.status = status;
                    todoStorage.set(id, todo);
                    return {
                        success: true,
                        todo,
                        message: `Updated todo "${todo.title}" to status: ${status}`,
                    };
                },
            }),

            // Backend tools
            // get_current_weather: tool({
            //     description: "Get the current weather",
            //     inputSchema: z.object({
            //         city: z.string(),
            //     }),
            //     execute: async ({ city }) => {
            //         return `The weather in ${city} is sunny`;
            //     },
            // }),

            generate_research_report: tool({
                description:
                    "Generate a final research report with the user's housing preferences. This tool requires human approval before generating the report. Call this tool when you're ready to create the final report - it will automatically extract all the necessary information from the conversation history.",
                inputSchema: z.object({}),
                execute: async () => {
                    // Use generateObject to extract structured data from the conversation history
                    const { object: extractedData } = await generateObject({
                        model: openrouter.chat("anthropic/claude-4.5-sonnet"),
                        schema: z.object({
                            summary: z
                                .string()
                                .describe(
                                    "A brief summary of the conversation and user's housing preferences"
                                ),
                            preferred_line: z
                                .string()
                                .describe(
                                    "The single preferred subway line (e.g., '1', 'A', 'L')"
                                ),
                            preferred_station: z
                                .string()
                                .describe(
                                    "The single preferred subway station name"
                                ),
                            budget_range: z
                                .string()
                                .optional()
                                .describe("User's budget range for rent"),
                            lifestyle_preferences: z
                                .array(z.string())
                                .optional()
                                .describe(
                                    "Lifestyle preferences (nightlife, quiet, family-friendly, etc.)"
                                ),
                            amenities_desired: z
                                .array(z.string())
                                .optional()
                                .describe(
                                    "Desired amenities (gyms, parks, restaurants, grocery stores, etc.)"
                                ),
                            commute_preferences: z
                                .string()
                                .optional()
                                .describe(
                                    "Details about commute preferences (time, transfers, etc.)"
                                ),
                            alternative_stations: z
                                .array(z.string())
                                .optional()
                                .describe(
                                    "Other stations the user was considering"
                                ),
                            neighborhood_likes: z
                                .array(z.string())
                                .optional()
                                .describe(
                                    "Things the user likes about the neighborhood/area"
                                ),
                            neighborhood_dislikes: z
                                .array(z.string())
                                .optional()
                                .describe(
                                    "Things the user dislikes or wants to avoid"
                                ),
                            alternative_neighborhoods: z
                                .array(z.string())
                                .optional()
                                .describe(
                                    "Other neighborhoods the user was considering"
                                ),
                        }),
                        messages: [
                            ...convertToModelMessages(messages),
                            {
                                role: "user",
                                content:
                                    "Based on the conversation history, extract the user's housing preferences into a structured format.",
                            },
                        ],
                    });

                    // Store the extracted data in memory and file system
                    pendingReportData = extractedData;

                    // Write to file system synchronously
                    try {
                        const tmpDir = join(process.cwd(), "tmp");
                        // Ensure tmp directory exists
                        if (!existsSync(tmpDir)) {
                            const { mkdirSync } = require("fs");
                            mkdirSync(tmpDir, { recursive: true });
                        }
                        writeFileSync(
                            REPORT_DATA_PATH,
                            JSON.stringify(extractedData, null, 2),
                            "utf-8"
                        );
                    } catch (error) {
                        console.error(
                            "Failed to write report data to file:",
                            error
                        );
                    }

                    return {
                        reportId: "latest",
                        message:
                            "Report data extracted and saved. Awaiting user approval.",
                    };
                },
            }),
        },
    });
    return result.toUIMessageStreamResponse();
}
