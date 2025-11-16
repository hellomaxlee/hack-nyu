"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckIcon, XIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModalContext } from "@/components/Dashboard";
import Image from "next/image";

export const ResearchReportUI: ToolCallMessagePartComponent = ({
  result,
}) => {
  const [status, setStatus] = useState<"pending" | "approved" | "denied">(
    "pending"
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const { setShowModalButton, setModalOpener } = useModalContext();

  // We only need the reportId from the result
  const reportId = result?.reportId;

  // Setup the ORPC mutation
  const { mutate: generateReport, isPending: isGenerating } = useMutation(
    orpc.powerpoint.createPlan.mutationOptions({
      onSuccess: (data) => {
        console.log("Report generated successfully:", data);
        setStatus("approved");

        // Load generated images from public/pptx_images
        const imageCount = data.createSlideJobs?.length - 1 || 0;
        const images = Array.from({ length: imageCount }, (_, i) =>
          `/pptx_images/slide_${i + 1}.png`
        );
        setGeneratedImages(images);
      },
      onError: (error) => {
        console.error("Error generating report:", error);
        setStatus("denied");
      },
    })
  );

  // Register modal opener with Dashboard when component mounts
  useEffect(() => {
    setModalOpener(() => setIsModalOpen(true));
  }, [setModalOpener]);

  // Effect to fetch report data and trigger mutation when modal opens
  useEffect(() => {
    if (!isModalOpen) return;

    const fetchDataAndGenerate = async () => {
      try {
        // First, fetch the report data from the file system
        const dataResponse = await fetch("/api/report-data");
        if (!dataResponse.ok) {
          return
        }
        const reportData = await dataResponse.json();

        // Then, trigger the ORPC mutation with the data
        generateReport({
          summary: reportData.summary || "",
          preferred_line: reportData.preferred_line || "",
          preferred_station: reportData.preferred_station || "",
          neighborhood_likes: reportData.neighborhood_likes || [],
          neighborhood_dislikes: reportData.neighborhood_dislikes || [],
          alternative_stations: reportData.alternative_stations || [],
          alternative_neighborhoods:
            reportData.alternative_neighborhoods || [],
          commute_preferences: reportData.commute_preferences || "",
          budget_range: reportData.budget_range || "",
          lifestyle_preferences: reportData.lifestyle_preferences || [],
          amenities_desired: reportData.amenities_desired || [],
          charts: reportData.charts || [],
          stats: reportData.stats || [],
          subwayLines: reportData.preferred_line
            ? [reportData.preferred_line]
            : [],
        });
      } catch (error) {
        console.error("Error fetching report data:", error);
        setStatus("denied");
      }
    };

    fetchDataAndGenerate();
  }, [isModalOpen, generateReport]);

  const handleApprove = () => {
    setIsModalOpen(true);
    setShowModalButton(true);
  };

  const handleDeny = () => {
    setStatus("denied");
  };

  return (
    <>
      <div
        className={`my-4 flex w-full flex-col gap-3 rounded-lg border py-3 px-4 ${status === "approved"
          ? "border-green-500 bg-green-50 dark:bg-green-950"
          : status === "denied"
            ? "border-gray-400 bg-gray-100 dark:bg-gray-800 opacity-60"
            : "border-blue-500 bg-blue-50 dark:bg-blue-950"
          }`}
      >
        <div className="flex items-center gap-2">
          <CheckIcon className="size-4" />
          <p className="grow font-semibold">
            {status === "pending"
              ? "Research Report Ready for Review"
              : status === "approved"
                ? "Report Generation Approved"
                : "Report Generation Denied"}
          </p>
        </div>

        {status === "pending" && (
          <div className="flex gap-2 mt-1">
            <Button
              onClick={handleApprove}
              disabled={isGenerating}
              className="flex-1"
              variant="default"
            >
              Approve
            </Button>
            <Button
              onClick={handleDeny}
              disabled={isGenerating}
              variant="outline"
            >
              Deny
            </Button>
          </div>
        )}

        {status === "approved" && (
          <div className="mt-1 p-2 bg-green-100 dark:bg-green-900 rounded text-sm">
            Report successfully generated!
          </div>
        )}

        {status === "denied" && (
          <div className="mt-1 p-2 bg-gray-200 dark:bg-gray-700 rounded text-sm">
            Report generation cancelled.
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Research Report</DialogTitle>
            {isGenerating &&
              <DialogDescription>
                <span className="text-sm text-muted-foreground block">Please wait while we generate your neighborhood report...</span>
              </DialogDescription>
            }
          </DialogHeader>

          <div className="flex flex-col items-center justify-center">
            {isGenerating ? (
              <div className="flex py-6 flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Processing...</p>
              </div>
            ) :
              (
                <>
                  {/* Display generated images */}
                  {generatedImages.length > 0 && (
                    <div className="w-full space-y-4 mt-4">
                      <div className="grid grid-cols-1 gap-4">
                        {generatedImages.map((imagePath, index) => (
                          <div key={index} className="border rounded-lg overflow-hidden">
                            <Image
                              src={imagePath}
                              alt={`Slide ${index + 1}`}
                              width={800}
                              height={600}
                              className="w-full h-auto"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

          </div>

        </DialogContent>
      </Dialog >
    </>
  );
};
