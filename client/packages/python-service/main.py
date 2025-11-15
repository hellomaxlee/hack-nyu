from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pptx import Presentation
import json
from enum import Enum

app = FastAPI(
    title="PPTX Service",
    description="FastAPI boilerplate for python-service",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def read_root():
    return {"message": "Hello from python-service FastAPI!"}

@app.get("/list-shapes")
async def list_shapes():    
    prs = Presentation("../reference.pptx")
    
    # List all shapes from all slides
    ignored_primary_keys = ["257_2", "257_5", "257_7"]
    shapes_info = []
    for slide in prs.slides:
        for shape in slide.shapes:
            primary_key = f"{slide.slide_id}_{shape.shape_id}"
            if primary_key in ignored_primary_keys:
                continue
            
            shapes_info.append({
                "primary_key": primary_key,
                "value": "image" if shape.shape_type == 13 else shape.text,
            })    

    with open("../shapes_info.json", "w") as f:
        json.dump(shapes_info, f, indent=4)
        
    return shapes_info


class ResearchType(Enum):
    image_gen = "image_gen"
    image_given = "image_given"
    text_gen = "text_gen"
    text_given = "text_given"
    subway_gen = "subway_gen"


class Research:
    def __init__(self, prompt: str, research_type: ResearchType):
        self.prompt = prompt
        self.research_type = research_type
    
    def to_dict(self):
        return {
            "prompt": self.prompt,
            "research_type": self.research_type.value
        }

def shape_to_research(primary_key: str) -> Research | None:
    match primary_key:
        case "256_2":
            return Research(prompt="Generate an image", research_type=ResearchType.image_gen)
        case "256_3":
            return Research(prompt="Summarize what the research query is in the location we're working on", research_type=ResearchType.text_gen)
        case "256_4":
            return Research(prompt="subway_1", research_type=ResearchType.subway_gen)
        case "257_2":
            return None
        case "257_3":
            return Research(prompt="chart_1", research_type=ResearchType.image_given)
        case "257_4":
            return Research(prompt="stats_1", research_type=ResearchType.text_given)
        case "257_5":
            return None
        case "257_6":
            return Research(prompt="stats_2", research_type=ResearchType.text_given)
        case "257_7":
            return None
        case "257_8":
            return Research(prompt="Generate a text based on the research query", research_type=ResearchType.text_gen)
        case _:
            return None

@app.get("/build-heuristic")
async def build_heuristic():    
    prs = Presentation("../reference.pptx")
    
    # Build the heuristic
    heuristic = {}
    for slide_idx, slide in enumerate(prs.slides):
        for shape_idx, shape in enumerate(slide.shapes):
            print(shape.name)
            # Create a unique primary key by joining slide_id and shape_id
            primary_key = f"{slide.slide_id}_{shape.shape_id}"
            heuristic[primary_key] = {
                "research": shape_to_research(primary_key).to_dict() if shape_to_research(primary_key) is not None  else None,
                "bounding_box": {
                    "left": shape.left,
                    "top": shape.top,
                    "width": shape.width,
                    "height": shape.height
                }
            }

    # Save heuristic to JSON file
    with open("../heuristic.json", "w") as f:
        json.dump(heuristic, f, indent=4)
    
    return heuristic

@app.post("/update-shape")
async def update_shape_text(request: Request):
    # takes in a primary key and the updated text value
    
    data = await request.json()
    referenceElementKey = data["referenceElementKey"]
    content = data["content"]
    
    # Parse the primary key to get slide_id and shape_id
    slide_id, shape_id = referenceElementKey.split("_")
    slide_id = int(slide_id)
    shape_id = int(shape_id)
    
    # Load the presentation
    prs = Presentation("../reference.pptx")
    
    # Find the slide and shape by their IDs
    target_slide = None
    for slide in prs.slides:
        if slide.slide_id == slide_id:
            target_slide = slide
            break
    
    if target_slide is None:
        return {"error": f"Slide with id {slide_id} not found"}
    
    target_shape = None
    for shape in target_slide.shapes:
        if shape.shape_id == shape_id:
            target_shape = shape
            break
    
    if target_shape is None:
        return {"error": f"Shape with id {shape_id} not found"}
    
    # Update the shape's text content
    if target_shape.has_text_frame:
        target_shape.text_frame.clear()
        target_shape.text_frame.text = content
    else:
        return {"error": "Shape does not have a text frame"}
    
    # Save the updated presentation
    output_path = "../reference_updated.pptx"
    prs.save(output_path)
    
    # Return the file for download
    return FileResponse(
        path=output_path,
        filename="reference_updated.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    
if __name__ == "__main__":
    # Run the app with: python main.py
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
