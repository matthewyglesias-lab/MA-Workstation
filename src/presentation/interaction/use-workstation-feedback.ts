import { useCallback, useState } from "preact/hooks";

export type FeedbackPurpose = "action" | "navigation";
export interface WorkstationFeedback {
  message: string | null;
  purpose: FeedbackPurpose;
}

/** Callers classify events explicitly. Never guess importance from message text. */
export function useWorkstationFeedback() {
  const [feedback, setFeedback] = useState<WorkstationFeedback>({ message: null, purpose: "action" });
  const announce = useCallback((message: string | null) => setFeedback({ message, purpose: "action" }), []);
  const navigate = useCallback((message: string) => setFeedback({ message, purpose: "navigation" }), []);
  return { ...feedback, announce, navigate };
}

/** Navigation remains announced in the same status region without a floating
 * confirmation. The legacy channel has no typed purpose: never hide its errors.
 */
export function feedbackPresentation(message: string, purpose: FeedbackPurpose, legacy: string) {
  const visible = [...new Set([purpose === "action" ? message : "", legacy].filter(Boolean))];
  return { visible, announcement: purpose === "navigation" && !visible.includes(message) ? message : "" };
}
