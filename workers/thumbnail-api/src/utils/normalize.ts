export const stripHtml = (value?: string | null) =>
  (value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
