import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { chromium } from "playwright";

export const submitWebFormTool = tool(
  async ({ url, fields, submitButtonText, waitForSelector }) => {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ baseURL: url });
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      // Fill each field by label text, placeholder, name, or id
      for (const [key, value] of Object.entries(fields)) {
        if (!value) continue;

        // Try label → input association
        const label = page.locator(`label:has-text("${key}")`);
        const labelCount = await label.count();

        if (labelCount > 0) {
          const forAttr = await label.first().getAttribute("for");
          if (forAttr) {
            await page.fill(`#${forAttr}`, String(value));
          } else {
            // Input inside label
            const input = label.first().locator("input, textarea, select");
            if ((await input.count()) > 0) {
              await input.first().fill(String(value));
            }
          }
        } else {
          // Try by placeholder, name, id
          const byPlaceholder = page.locator(
            `input[placeholder*="${key}" i], textarea[placeholder*="${key}" i]`,
          );
          if ((await byPlaceholder.count()) > 0) {
            await byPlaceholder.first().fill(String(value));
            continue;
          }

          const byName = page.locator(
            `input[name*="${key}" i], textarea[name*="${key}" i], select[name*="${key}" i]`,
          );
          if ((await byName.count()) > 0) {
            const el = byName.first();
            try {
              await el.selectOption(String(value));
            } catch {
              await el.fill(String(value));
            }
            continue;
          }

          const byId = page.locator(`#${key}`);
          if ((await byId.count()) > 0) {
            await byId.first().fill(String(value));
          }
        }
      }

      // Wait for specified selector if provided
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: 5000 });
        } catch {
          // optional wait
        }
      }

      // Find and click submit button
      let submitted = false;
      if (submitButtonText) {
        const btn = page.locator(
          `button:has-text("${submitButtonText}"), input[type="submit"][value*="${submitButtonText}" i]`,
        );
        if ((await btn.count()) > 0) {
          await btn.first().click();
          submitted = true;
        }
      }

      if (!submitted) {
        // Try common submit buttons
        const submitBtn = page.locator(
          'button[type="submit"], input[type="submit"]',
        );
        if ((await submitBtn.count()) > 0) {
          await submitBtn.first().click();
          submitted = true;
        }
      }

      // Wait for navigation/response
      if (submitted) {
        await page.waitForTimeout(3000);
      }

      const currentUrl = page.url();
      const pageTitle = await page.title();
      const bodyText = await page.locator("body").innerText().catch(() => "");

      // Check for confirmation
      const confirmationKeywords = [
        "thank", "confirmed", "registered", "submitted", "success",
        "check your email", "confirmation", "you're registered",
      ];
      const isConfirmed = confirmationKeywords.some((kw) =>
        bodyText.toLowerCase().includes(kw),
      );

      await browser.close();
      browser = undefined;

      if (isConfirmed) {
        return (
          `Form submitted successfully!\n` +
          `Page: ${pageTitle}\n` +
          `URL: ${currentUrl}\n` +
          `Confirmation detected in response page.\n\n` +
          `Registered fields: ${Object.entries(fields)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")}`
        );
      }

      return (
        `Form submitted. Response page: "${pageTitle}" at ${currentUrl}\n` +
        `Confirmation message not detected. Please check the URL above to verify registration was completed.\n\n` +
        `Submitted fields:\n${Object.entries(fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")}`
      );
    } catch (error) {
      return `Web form submission error: ${(error as Error).message}`;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  },
  {
    name: "submit_web_form",
    description:
      "Navigate to a URL and fill in a web form. Uses Playwright to find form fields by label text, placeholder, name attribute, or id. Can submit the form and detect confirmation messages. Use for conference registration, grant application portals, newsletter signups, and any web-based form.",
    schema: z.object({
      url: z
        .string()
        .describe("The full URL of the page containing the form to fill"),
      fields: z
        .record(z.string(), z.string())
        .describe(
          "Object mapping field identifiers (label text, placeholder, name, or id) to values to fill. Example: {\"First Name\": \"Ashley\", \"company\": \"Dermaqea\", \"email\": \"ashley@dermaqea.com\"}",
        ),
      submitButtonText: z
        .string()
        .optional()
        .describe(
          "Text of the submit button to click (e.g., 'Register', 'Submit', 'Apply Now'). If not provided, tries the first button[type=submit].",
        ),
      waitForSelector: z
        .string()
        .optional()
        .describe(
          "CSS selector to wait for before filling (e.g., '#registration-form'). Useful if the form loads asynchronously.",
        ),
    }),
  },
);

export const registerForEventTool = tool(
  async ({ eventName, eventUrl, attendeeName, attendeeEmail, company, jobTitle, additionalFields }) => {
    const fields: Record<string, string> = {
      "First Name": (attendeeName || "Ashley").split(" ")[0] || "Ashley",
      "Last Name": (attendeeName || "Ashley").split(" ").slice(1).join(" ") || "Luna",
      "Email": attendeeEmail || "ashley@dermaqea.com",
      "Company": company || "Dermaqea",
      "Organization": company || "Dermaqea",
      "Job Title": jobTitle || "CEO & Founder",
      "Title": jobTitle || "CEO & Founder",
      "Phone": "",
      "Website": "https://dermaqea.vercel.app",
      ...(additionalFields || {}),
    };

    const result = await submitWebFormTool.invoke({
      url: eventUrl,
      fields,
      submitButtonText: "Register",
    });

    const isSuccess = result.startsWith("Form submitted successfully");
    return `${isSuccess ? "Successfully registered" : "Registration attempted"} for "${eventName}".\n\n${result}`;
  },
  {
    name: "register_for_event",
    description:
      "Register Dermaqea for a conference, expo, or industry event. Uses Dermaqea's default contact info and fills the event's registration form automatically. Requires the event's registration page URL. Submits the form and confirms success. Call this after getting approval for CONFERENCE_REGISTRATION.",
    schema: z.object({
      eventName: z.string().describe("Name of the event to register for"),
      eventUrl: z
        .string()
        .describe("URL of the event's registration/signup page"),
      attendeeName: z
        .string()
        .optional()
        .describe("Attendee full name (defaults to Ashley Luna)"),
      attendeeEmail: z
        .string()
        .optional()
        .describe("Attendee email (defaults to ashley@dermaqea.com)"),
      company: z
        .string()
        .optional()
        .describe("Company name (defaults to Dermaqea)"),
      jobTitle: z
        .string()
        .optional()
        .describe("Job title (defaults to CEO & Founder)"),
      additionalFields: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Any additional form fields not covered by the defaults. Map field label → value.",
        ),
    }),
  },
);
