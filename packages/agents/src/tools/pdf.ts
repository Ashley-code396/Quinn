import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PDFDocument, rgb, StandardFonts, PDFFont } from "pdf-lib";
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

export const generatePdfTool = tool(
  async ({ title, content, includeTableOfContents }) => {
    try {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([612, 792]);
      const { width, height } = page.getSize();
      const margin = 50;
      const maxWidth = width - 2 * margin;

      let y = height - margin;

      function wrapText(
        text: string,
        fontSize: number,
        maxW: number,
        fontObj: PDFFont,
      ): string[] {
        const words = text.split(" ");
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (fontObj.widthOfTextAtSize(test, fontSize) > maxW) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines;
      }

      function writeText(
        text: string,
        fontSize: number,
        fontObj: PDFFont,
        color: any,
      ) {
        const lines = wrapText(text, fontSize, maxWidth, fontObj);
        for (const line of lines) {
          if (y < margin) {
            const newPage = doc.addPage([612, 792]);
            y = newPage.getSize().height - margin;
          }
          page.drawText(line, {
            x: margin,
            y,
            size: fontSize,
            font: fontObj,
            color,
          });
          y -= fontSize * 1.4;
        }
        y -= 8;
      }

      // Title
      writeText(title, 22, boldFont, rgb(0.1, 0.1, 0.3));
      y -= 10;

      // Line
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.3, 0.3, 0.6),
      });
      y -= 16;

      // Date
      writeText(
        `Generated: ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
        10,
        font,
        rgb(0.5, 0.5, 0.5),
      );
      y -= 10;

      // Table of Contents
      if (includeTableOfContents) {
        writeText("Table of Contents", 14, boldFont, rgb(0.2, 0.2, 0.2));
        const sections = content
          .split("\n")
          .filter((l) => l.match(/^#{1,3}\s/))
          .map((l) => l.replace(/^#+\s/, ""));
        for (const section of sections) {
          writeText(`  • ${section}`, 11, font, rgb(0.3, 0.3, 0.3));
        }
        y -= 16;
      }

      // Content
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.startsWith("### ")) {
          writeText(line.replace("### ", ""), 13, boldFont, rgb(0.2, 0.2, 0.4));
        } else if (line.startsWith("## ")) {
          writeText(line.replace("## ", ""), 15, boldFont, rgb(0.15, 0.15, 0.35));
        } else if (line.startsWith("# ")) {
          writeText(line.replace("# ", ""), 18, boldFont, rgb(0.1, 0.1, 0.3));
        } else if (line.startsWith("- ")) {
          writeText(line, 11, font, rgb(0.2, 0.2, 0.2));
        } else if (line.trim() === "") {
          y -= 8;
        } else {
          writeText(line, 11, font, rgb(0.2, 0.2, 0.2));
        }

        if (y < margin) {
          const newPage = doc.addPage([612, 792]);
          y = newPage.getSize().height - margin;
        }
      }

      // Footer
      const pageCount = doc.getPageCount();
      for (let i = 0; i < pageCount; i++) {
        const p = doc.getPage(i);
        const { height: h } = p.getSize();
        p.drawText(`Dermaqea  •  Page ${i + 1} of ${pageCount}`, {
          x: margin,
          y: 30,
          size: 8,
          font,
          color: rgb(0.6, 0.6, 0.6),
        });
      }

      const pdfBytes = await doc.save();
      const filename = `${sanitizeFilename(title)}_${Date.now()}.pdf`;
      const filepath = path.join(ASSETS_DIR, filename);
      fs.writeFileSync(filepath, pdfBytes);

      return `PDF generated successfully.\nTitle: ${title}\nFile: ${filepath}\nPages: ${pageCount}\nSize: ${(pdfBytes.length / 1024).toFixed(1)} KB\n\nYou can send this file path to the user or attach it to an email.`;
    } catch (error) {
      return `PDF generation error: ${(error as Error).message}`;
    }
  },
  {
    name: "generate_pdf",
    description:
      "Generate a professional PDF document from markdown-style text content. Use for whitepapers, one-pagers, brochures, reports, and proposals. Returns the file path to the generated PDF.",
    schema: z.object({
      title: z.string().describe("Document title displayed on the first page"),
      content: z
        .string()
        .describe(
          "Full document content in markdown-style format. Use # ## ### for headings, - for bullet points, blank lines for spacing.",
        ),
      includeTableOfContents: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to include a table of contents after the title page"),
    }),
  },
);
