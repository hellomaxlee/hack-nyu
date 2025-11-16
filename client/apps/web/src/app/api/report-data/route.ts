import { readFileSync, existsSync } from "fs";
import { join } from "path";

// File path for storing report data
const REPORT_DATA_PATH = join(process.cwd(), "tmp", "report-data.json");

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

// GET endpoint to retrieve report data from file system
export async function GET() {
    try {
        if (!existsSync(REPORT_DATA_PATH)) {
            return Response.json(
                { error: "No pending report data" },
                { status: 404 }
            );
        }

        const fileData = readFileSync(REPORT_DATA_PATH, "utf-8");
        const reportData = JSON.parse(fileData) as ResearchReportData;

        return Response.json(reportData);
    } catch (error) {
        console.error("Error reading report data:", error);
        return Response.json(
            { error: "Failed to read report data" },
            { status: 500 }
        );
    }
}
