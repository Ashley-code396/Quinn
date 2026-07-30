import { tool } from "@langchain/core/tools";
import { z } from "zod";
import PptxGenJS from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../../assets");

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
}

type SlideInput = {
  heading: string;
  body: string;
  layout?: "title" | "content" | "section" | "two_column";
  notes?: string;
};

export const generateSlidesTool = tool(
  async ({ title, subtitle, slides }) => {
    try {
      const pptx = new PptxGenJS();
      pptx.author = "Dermaqea";
      pptx.title = title;
      pptx.subject = subtitle ?? "";

      const accentColor: any = { type: "solid", color: "1A1A3E" };
      const whiteBg: any = { type: "solid", color: "FFFFFF" };

      // Title slide
      const titleSlide = pptx.addSlide();
      titleSlide.background = accentColor;
      titleSlide.addText(title, {
        x: 1,
        y: 2.5,
        w: 8,
        h: 1.5,
        fontSize: 36,
        color: "FFFFFF",
        fontFace: "Arial",
        bold: true,
        align: "center",
      });
      if (subtitle) {
        titleSlide.addText(subtitle, {
          x: 1,
          y: 4,
          w: 8,
          h: 0.8,
          fontSize: 18,
          color: "CCCCDD",
          fontFace: "Arial",
          align: "center",
        });
      }
      titleSlide.addText("Dermaqea", {
        x: 1,
        y: 6.5,
        w: 8,
        h: 0.5,
        fontSize: 14,
        color: "9999AA",
        fontFace: "Arial",
        align: "center",
      });

      for (const slide of slides) {
        const s = pptx.addSlide();
        s.background = slide.layout === "section" ? accentColor : whiteBg;

        // Slide number
        s.addText(
          `${slides.indexOf(slide) + 2}`,
          {
            x: 9,
            y: 7,
            w: 0.5,
            h: 0.4,
            fontSize: 10,
            color: "999999",
            fontFace: "Arial",
            align: "right",
          },
        );

        if (slide.layout === "section") {
          s.addText(slide.heading, {
            x: 1,
            y: 3,
            w: 8,
            h: 1.2,
            fontSize: 32,
            color: "FFFFFF",
            fontFace: "Arial",
            bold: true,
            align: "center",
          });
          if (slide.body) {
            s.addText(slide.body, {
              x: 1.5,
              y: 4.3,
              w: 7,
              h: 1,
              fontSize: 16,
              color: "CCCCDD",
              fontFace: "Arial",
              align: "center",
            });
          }
        } else if (slide.layout === "two_column") {
          const parts = slide.body.split("---").map((p) => p.trim());
          s.addText(slide.heading, {
            x: 0.5,
            y: 0.3,
            w: 9,
            h: 0.7,
            fontSize: 22,
            color: "1a1a3e",
            fontFace: "Arial",
            bold: true,
          });
          s.addText(parts[0] || "", {
            x: 0.5,
            y: 1.2,
            w: 4.2,
            h: 5.5,
            fontSize: 14,
            color: "333333",
            fontFace: "Arial",
            valign: "top",
            lineSpacingMultiple: 1.3,
          });
          s.addText(parts[1] || "", {
            x: 5.3,
            y: 1.2,
            w: 4.2,
            h: 5.5,
            fontSize: 14,
            color: "333333",
            fontFace: "Arial",
            valign: "top",
            lineSpacingMultiple: 1.3,
          });
        } else {
          s.addText(slide.heading, {
            x: 0.5,
            y: 0.3,
            w: 9,
            h: 0.7,
            fontSize: 22,
            color: "1a1a3e",
            fontFace: "Arial",
            bold: true,
          });
          s.addText(slide.body, {
            x: 0.5,
            y: 1.2,
            w: 9,
            h: 5.5,
            fontSize: 14,
            color: "333333",
            fontFace: "Arial",
            valign: "top",
            lineSpacingMultiple: 1.3,
          });
        }
      }

      const result = await pptx.write({ outputType: "nodebuffer" });
      const buffer = result as Buffer;
      const filename = `${sanitizeFilename(title)}_${Date.now()}.pptx`;
      const filepath = path.join(ASSETS_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      return `Presentation generated successfully.\nTitle: ${title}\nFile: ${filepath}\nSlides: ${slides.length + 1}\nSize: ${(buffer.length / 1024).toFixed(1)} KB\n\nThis .pptx file can be opened in PowerPoint, Google Slides, or LibreOffice.`;
    } catch (error) {
      return `Slides generation error: ${(error as Error).message}`;
    }
  },
  {
    name: "generate_slides",
    description:
      "Generate a professional presentation (.pptx) from slide content. Use for pitch decks, investor decks, sales decks, partnership proposals, and conference presentations. Returns the file path to the generated .pptx file which works in PowerPoint and Google Slides.",
    schema: z.object({
      title: z.string().describe("Presentation title (shown on the cover slide)"),
      subtitle: z
        .string()
        .optional()
        .describe("Subtitle or tagline for the cover slide"),
      slides: z
        .array(
          z.object({
            heading: z.string().describe("Slide heading/title"),
            body: z
              .string()
              .describe(
                "Slide body content. Use bullet points (-), blank lines for spacing. For two_column layout, use --- to separate left and right columns.",
              ),
            layout: z
              .enum(["title", "content", "section", "two_column"])
              .optional()
              .default("content")
              .describe(
                "Slide layout: title (cover), content (default), section (divider), two_column (side-by-side content)",
              ),
            notes: z
              .string()
              .optional()
              .describe("Speaker notes for this slide"),
          }),
        )
        .describe("Array of slide content objects"),
    }),
  },
);
