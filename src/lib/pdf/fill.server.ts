// pdf-lib AcroForm injection — TS equivalent of the pypdf utilities in the blueprint.
// Handles text fields, checkboxes (auto-resolves /V and /AS), radio groups, and flattening.

import { PDFDocument, PDFCheckBox, PDFTextField, PDFRadioGroup, PDFDropdown } from "pdf-lib";

export type FillSpec = {
  text?: Record<string, string>;
  checkboxes?: Record<string, boolean>;
  radios?: Record<string, string>;
  dropdowns?: Record<string, string>;
  flatten?: boolean;
};

export type FieldDescriptor = {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "unknown";
  options?: string[];
};

export async function describeFields(templateBytes: Uint8Array): Promise<FieldDescriptor[]> {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  return form.getFields().map((f) => {
    const name = f.getName();
    if (f instanceof PDFTextField) return { name, type: "text" as const };
    if (f instanceof PDFCheckBox) return { name, type: "checkbox" as const };
    if (f instanceof PDFRadioGroup) return { name, type: "radio" as const, options: f.getOptions() };
    if (f instanceof PDFDropdown) return { name, type: "dropdown" as const, options: f.getOptions() };
    return { name, type: "unknown" as const };
  });
}

export async function fillTemplate(templateBytes: Uint8Array, spec: FillSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();

  if (spec.text) {
    for (const [name, value] of Object.entries(spec.text)) {
      try {
        const field = form.getTextField(name);
        field.setText(value ?? "");
      } catch {
        // field doesn't exist — skip silently to be tolerant of template drift
      }
    }
  }

  if (spec.checkboxes) {
    for (const [name, on] of Object.entries(spec.checkboxes)) {
      try {
        const cb = form.getCheckBox(name);
        // pdf-lib resolves /V and /AS internally, including non-standard export
        // values like /Yes, /1, /On — equivalent to pypdf's manual NameObject work.
        if (on) cb.check();
        else cb.uncheck();
      } catch {
        // skip
      }
    }
  }

  if (spec.radios) {
    for (const [name, value] of Object.entries(spec.radios)) {
      try {
        form.getRadioGroup(name).select(value);
      } catch {
        // skip
      }
    }
  }

  if (spec.dropdowns) {
    for (const [name, value] of Object.entries(spec.dropdowns)) {
      try {
        form.getDropdown(name).select(value);
      } catch {
        // skip
      }
    }
  }

  // Force the viewer to regenerate appearance streams (equiv. to /NeedAppearances true)
  form.updateFieldAppearances();

  if (spec.flatten) {
    form.flatten();
  }

  return await pdf.save();
}

/**
 * Generate a blank fillable PDF in-memory for demos when no real template exists.
 * Creates a single page with text fields keyed by the provided field names.
 */
export async function generateDemoTemplate(title: string, fields: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { height } = page.getSize();
  const form = pdf.getForm();

  page.drawText(title, { x: 50, y: height - 60, size: 18 });
  page.drawText("Government of India — Application Form (demo)", { x: 50, y: height - 80, size: 10 });

  let y = height - 130;
  for (const name of fields) {
    page.drawText(name + ":", { x: 50, y, size: 11 });
    const tf = form.createTextField(name);
    tf.addToPage(page, { x: 220, y: y - 6, width: 320, height: 22 });
    y -= 40;
    if (y < 80) break;
  }

  return await pdf.save();
}
