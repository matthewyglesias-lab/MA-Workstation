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
import {
  injectionInput,
  injectionUpdate,
  injectionReview,
  injectionAdministration,
  injectionDisposition,
  injectionAmendment,
  injectionFiling,
} from "../shared/injections.js";
let repo: Awaited<ReturnType<typeof seededDemo>>;
const actor: Actor = {
  id: "synthetic-preview-staff",
  displayName: "Preview staff",
  roles: ["Console.Operator", "Inventory.Manager"],
};
let signedIn = false;
export async function initializePreview() {
  signedIn = false;
  repo = await seededDemo("America/Los_Angeles");
}
export async function previewSignIn(staffCode: string, pin: string) {
  if (staffCode !== "demo" || pin !== "123456")
    throw new Error("Use the preview staff ID and PIN shown below.");
  signedIn = true;
  return { actor, csrfToken: "preview-csrf" };
}
export function previewSignOut() {
  signedIn = false;
}
export async function previewRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  if (!signedIn)
    throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  if (method === "GET" && path === "/session")
    return { actor, csrfToken: "preview-csrf" } as T;
  if (method === "GET" && path === "/overview")
    return (await repo.overview(actor)) as T;
  if (method === "GET" && path === "/injections")
    return (await repo.listInjections(actor)) as T;
  const command = { key: uuid.parse(key), actor };
  if (method === "POST") {
    switch (path) {
      case "/injections":
        return (await repo.createInjection(
          injectionInput.parse(body),
          command,
        )) as T;
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
  const injection =
    /^\/injections\/([^/]+)(?:\/(review|administer|disposition|amend|file))?$/.exec(
      path,
    );
  if (injection) {
    const id = uuid.parse(injection[1]);
    if (method === "PATCH" && !injection[2])
      return (await repo.updateInjection(
        id,
        injectionUpdate.parse(body),
        command,
      )) as T;
    if (method === "POST")
      switch (injection[2]) {
        case "review":
          return (await repo.reviewInjection(
            id,
            injectionReview.parse(body),
            command,
          )) as T;
        case "administer":
          return (await repo.administerInjection(
            id,
            injectionAdministration.parse(body),
            command,
          )) as T;
        case "disposition":
          return (await repo.dispositionInjection(
            id,
            injectionDisposition.parse(body),
            command,
          )) as T;
        case "amend":
          return (await repo.amendInjection(
            id,
            injectionAmendment.parse(body),
            command,
          )) as T;
        case "file":
          return (await repo.fileInjection(
            id,
            injectionFiling.parse(body),
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
