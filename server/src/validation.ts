import { z } from "zod";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const tmuxSessionNameSchema = z.string()
  .min(1, "tmux session name is required")
  .max(80, "tmux session name must be 80 characters or fewer")
  .refine((value) => value.trim() === value, "tmux session name cannot start or end with whitespace")
  .refine((value) => !value.includes(":"), "tmux session name cannot contain ':'")
  .refine((value) => !CONTROL_CHARS.test(value), "tmux session name cannot contain control characters");

export const tmuxWindowNameSchema = z.string()
  .min(1, "tmux window name is required")
  .max(80, "tmux window name must be 80 characters or fewer")
  .refine((value) => value.trim() === value, "tmux window name cannot start or end with whitespace")
  .refine((value) => !CONTROL_CHARS.test(value), "tmux window name cannot contain control characters");

export function zodErrorMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
