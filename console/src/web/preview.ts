/** Build-time, browser-only synthetic adapter. Never used as an API failure fallback. */
import { seededDemo } from "../server/platform/demo-repository.js";
import {
  activityInput,
  activityUpdate,
  lotInput,
  movementInput,
  patientInput,
  productInput,
  uuid,
  type Actor,
} from "../shared/contracts.js";
let repo: Awaited<ReturnType<typeof seededDemo>>;
const actor: Actor = {
  id: "synthetic-preview-staff",
  roles: ["Console.Operator", "Inventory.Manager"],
};
export async function initializePreview() {
  repo = await seededDemo("America/Los_Angeles");
}
export async function previewRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  if (method === "GET" && path === "/session") return { actor } as T;
  if (method === "GET" && path === "/overview")
    return (await repo.overview(actor)) as T;
  const command = { key: uuid.parse(key), actor };
  if (method === "POST") {
    switch (path) {
      case "/patients":
        return (await repo.createPatient(
          patientInput.parse(body),
          command,
        )) as T;
      case "/activities":
        return (await repo.createActivity(
          activityInput.parse(body),
          command,
        )) as T;
      case "/products":
        return (await repo.createProduct(
          productInput.parse(body),
          command,
        )) as T;
      case "/lots":
        return (await repo.createLot(lotInput.parse(body), command)) as T;
      case "/movements":
        return (await repo.postMovement(
          movementInput.parse(body),
          command,
        )) as T;
    }
  }
  const match = /^\/activities\/([^/]+)$/.exec(path);
  if (method === "PATCH" && match)
    return (await repo.updateActivity(
      uuid.parse(match[1]),
      activityUpdate.parse(body),
      command,
    )) as T;
  throw new Error("This action is unavailable in the synthetic preview.");
}
